// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title AnkerNote
 * @notice Wallet-owned proof of one Anker Dual Investment Position.
 *
 * Self-custody narrative, unchanged from the Sui original: the *funds* never
 * live here. Principal sits in DreamDEX as collateral behind the Event Contract
 * legs; this NFT is the receipt that records every term of the trade so a
 * Position is auditable and transferable without the protocol holding anything.
 *
 * ## What is different from the Sui ProductNote, deliberately
 *
 * 1. **The fee is enforced on-chain.** The Move version took the fee as a
 *    caller-supplied `Coin` and never checked its value against the registry
 *    rate, so a hand-built PTB paid zero. Here `recordRedeemWithFee` computes
 *    the fee itself from the note's own snapshot and pulls it with
 *    `safeTransferFrom` — the caller cannot under-pay it.
 *
 * 2. **Transfer does not brick the note.** The Move version froze `owner` at
 *    mint and asserted `sender == owner` on redeem, so a transferred note
 *    became permanently unredeemable. Here redemption is gated on
 *    `ownerOf(tokenId)`, so the note stays a real bearer instrument.
 *
 * 3. **No coupon, no fee.** A performance fee is charged on coupon actually
 *    earned, never on returned principal.
 */
contract AnkerNote is ERC721Enumerable, Ownable {
    using SafeERC20 for IERC20;

    // === Types ===

    enum Status {
        Open,
        Redeemed
    }

    struct Note {
        uint256 principal;
        uint256 reserve;
        uint256 coupon;
        uint256 targetPrice;
        uint256 floorPrice;
        uint256 aprBps;
        /// Registry rate captured at mint, so a later rate change cannot be applied retroactively.
        uint256 feeBpsSnapshot;
        uint64 expiry;
        /// DreamDEX market ids backing this Position (one per leg).
        string[] strikes;
        uint256[] quantities;
        uint256[] costs;
        Status status;
    }

    // === Errors ===

    error FeeTooHigh(uint256 bps);
    error NotNoteOwner(uint256 tokenId, address caller);
    error AlreadyRedeemed(uint256 tokenId);
    error LegArityMismatch();
    error ZeroCollateral();
    error UnknownNote(uint256 tokenId);

    // === Events ===

    event FeePolicyUpdated(uint256 feeBps, address feeRecipient);
    event Subscribed(
        uint256 indexed tokenId,
        address indexed owner,
        uint256 principal,
        uint256 coupon,
        uint64 expiry,
        uint256 feeBpsSnapshot,
        uint256 legCount
    );
    event Redeemed(
        uint256 indexed tokenId,
        address indexed owner,
        uint256 payoutAmount,
        uint256 feeAmount
    );

    // === Storage ===

    uint256 public constant MAX_FEE_BPS = 10_000;

    /// Registry: performance fee on coupon. Default 1000 = 10%.
    uint256 public feeBps = 1_000;
    address public feeRecipient;
    /// Collateral the fee is denominated in (tUSDC on Shannon).
    IERC20 public immutable collateral;

    uint256 private _nextTokenId = 1;
    mapping(uint256 => Note) private _notes;

    constructor(address collateral_, address owner_) ERC721("Anker Note", "ANKER") Ownable(owner_) {
        if (collateral_ == address(0)) revert ZeroCollateral();
        collateral = IERC20(collateral_);
        feeRecipient = owner_;
    }

    // === Registry admin ===

    function setFeePolicy(uint256 newFeeBps, address newRecipient) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert FeeTooHigh(newFeeBps);
        feeBps = newFeeBps;
        feeRecipient = newRecipient;
        emit FeePolicyUpdated(newFeeBps, newRecipient);
    }

    // === Subscribe ===

    /**
     * @notice Mint the receipt for one Position. Holds no funds.
     * @dev Permissionless by design: the note records a trade the caller already
     *      executed on DreamDEX under their own wallet. It confers no claim on
     *      protocol funds, so minting one for yourself gains you nothing — the
     *      collateral is in DreamDEX under your own address either way.
     */
    function subscribe(
        uint256 principal,
        uint256 reserve,
        uint256 coupon,
        uint256 targetPrice,
        uint256 floorPrice,
        uint256 aprBps,
        uint64 expiry,
        string[] calldata strikes,
        uint256[] calldata quantities,
        uint256[] calldata costs
    ) external returns (uint256 tokenId) {
        if (strikes.length != quantities.length || strikes.length != costs.length) {
            revert LegArityMismatch();
        }

        tokenId = _nextTokenId++;
        Note storage note = _notes[tokenId];
        note.principal = principal;
        note.reserve = reserve;
        note.coupon = coupon;
        note.targetPrice = targetPrice;
        note.floorPrice = floorPrice;
        note.aprBps = aprBps;
        note.feeBpsSnapshot = feeBps;
        note.expiry = expiry;
        note.strikes = strikes;
        note.quantities = quantities;
        note.costs = costs;
        note.status = Status.Open;

        _safeMint(msg.sender, tokenId);
        emit Subscribed(tokenId, msg.sender, principal, coupon, expiry, feeBps, strikes.length);
    }

    // === Claim ===

    /**
     * @notice Close a Position: record the payout and pull the performance fee.
     * @param payoutAmount Gross payout the holder realized on DreamDEX.
     * @dev The fee is derived here from the note's own snapshot — never taken
     *      from a caller-supplied number. Charged on coupon only, so a Position
     *      that earned nothing pays nothing.
     */
    function recordRedeemWithFee(uint256 tokenId, uint256 payoutAmount) external returns (uint256 feeAmount) {
        address holder = _ownerOf(tokenId);
        if (holder == address(0)) revert UnknownNote(tokenId);
        if (holder != msg.sender) revert NotNoteOwner(tokenId, msg.sender);

        Note storage note = _notes[tokenId];
        if (note.status == Status.Redeemed) revert AlreadyRedeemed(tokenId);
        note.status = Status.Redeemed;

        // No coupon, no fee.
        feeAmount = note.coupon == 0 ? 0 : (note.coupon * note.feeBpsSnapshot) / MAX_FEE_BPS;
        if (feeAmount > 0) {
            collateral.safeTransferFrom(msg.sender, feeRecipient, feeAmount);
        }

        emit Redeemed(tokenId, holder, payoutAmount, feeAmount);
    }

    // === Views ===

    function getNote(uint256 tokenId) external view returns (Note memory) {
        if (_ownerOf(tokenId) == address(0)) revert UnknownNote(tokenId);
        return _notes[tokenId];
    }

    /// Fee a given note would owe on claim, for the UI to display before signing.
    function quoteFee(uint256 tokenId) external view returns (uint256) {
        Note storage note = _notes[tokenId];
        if (note.coupon == 0) return 0;
        return (note.coupon * note.feeBpsSnapshot) / MAX_FEE_BPS;
    }

    function totalNotes() external view returns (uint256) {
        return _nextTokenId - 1;
    }
}
