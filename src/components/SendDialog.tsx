'use client';

import { useCurrentAccount, useCurrentClient, useCurrentWallet, useDAppKit } from '@mysten/dapp-kit-react';
import { isEnokiWallet } from '@mysten/enoki';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { useState } from 'react';
import { useWalletFunds } from '../hooks/useWalletFunds';
import { copyForLocale, DEFAULT_LOCALE, formattersForLocale, type Locale } from '../i18n';
import { buildSendDusdcTransaction, formatDusdcAmount, parseDusdcAmount } from '../sui/sendTransactions';
import { isSponsorshipEnabled } from '../sui/sponsoredExecution';
import { executeWalletTransaction } from '../sui/transactionExecution';
import { preflightTransaction } from '../sui/transactionPreflight';
import { Button, Dialog, InputField, KeyValue, KeyValueList } from '../ui';
import { shortAddress, shortId, suiExplorerTxUrl } from './PortfolioFormat';

interface SendSuccess {
  digest: string;
  amountText: string;
  recipient: string;
}

/**
 * Send (转出): dUSDC from Available to any Sui address. Wallet coins are spent
 * first; the difference is swept out of the sender's own wrapper inside the
 * same transaction (buildSendDusdcTransaction), so the user can always send
 * the full Available number the app shows. Enoki sessions execute sponsored
 * with the recipient declared to the sponsor gate (ADR-0010).
 */
export function SendDialog({
  open,
  locale = DEFAULT_LOCALE,
  onClose,
}: {
  open: boolean;
  locale?: Locale;
  onClose: () => void;
}) {
  const copy = copyForLocale(locale);
  const dialogCopy = copy.wallet.sendDialog;
  const fmt = formattersForLocale(locale);
  const account = useCurrentAccount();
  const client = useCurrentClient();
  const currentWallet = useCurrentWallet();
  const dAppKit = useDAppKit();
  const funds = useWalletFunds();

  const [recipient, setRecipient] = useState('');
  const [amountText, setAmountText] = useState('');
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SendSuccess | null>(null);

  if (!open) return null;

  const availableBaseUnits = funds.walletBaseUnits + (funds.wrapper?.balanceBaseUnits ?? 0n);
  const recipientValid = isValidSuiAddress(recipient.trim());
  const isSelfSend =
    recipientValid && account != null && normalizeSuiAddress(recipient.trim()) === normalizeSuiAddress(account.address);
  const amountBaseUnits = parseDusdcAmount(amountText);
  const amountValid = amountBaseUnits !== null && amountBaseUnits > 0n;
  const exceedsBalance = amountValid && amountBaseUnits > availableBaseUnits;
  const isEnokiSession = Boolean(currentWallet && isEnokiWallet(currentWallet));
  const canSubmit =
    Boolean(account) && recipientValid && amountValid && !exceedsBalance && !isPending;

  function resetAndClose() {
    if (isPending) return;
    setRecipient('');
    setAmountText('');
    setError(null);
    setSuccess(null);
    onClose();
  }

  function fillMax() {
    if (funds.available === null) return;
    setAmountText(formatDusdcAmount(availableBaseUnits));
  }

  async function handleSend() {
    if (!canSubmit || !account || amountBaseUnits === null) return;
    setIsPending(true);
    setError(null);
    try {
      const plan = buildSendDusdcTransaction({
        sender: account.address,
        recipient: recipient.trim(),
        amountBaseUnits,
        walletBalanceBaseUnits: funds.walletBaseUnits,
        wrapper: funds.wrapper ?? undefined,
      });
      await preflightTransaction({ client, sender: account.address, transaction: plan.tx });
      const sponsored = isEnokiSession && (await isSponsorshipEnabled());
      const digest = await executeWalletTransaction({
        wallet: dAppKit,
        client,
        transaction: plan.tx,
        sender: account.address,
        sponsored,
        sponsoredRecipient: sponsored ? plan.recipient : undefined,
      });
      await client.waitForTransaction({ digest });
      await funds.refresh();
      setSuccess({ digest, amountText: fmt.cashAmount(Number(amountBaseUnits) / 10 ** 6), recipient: plan.recipient });
    } catch (nextError) {
      await funds.refresh().catch(() => undefined);
      setError(nextError instanceof Error ? nextError.message : dialogCopy.failed);
    } finally {
      setIsPending(false);
    }
  }

  if (success) {
    return (
      <Dialog open onClose={resetAndClose} ariaLabel={dialogCopy.successTitle} closeLabel={copy.common.close}>
        <div className="success-dialog">
          <span className="success-dialog-check" aria-hidden="true">
            ✓
          </span>
          <h3 className="success-dialog-title">{dialogCopy.successTitle}</h3>
          <p className="success-dialog-intro">{dialogCopy.successSent}</p>
          <strong className="success-dialog-hero">{success.amountText} dUSDC</strong>
          <KeyValueList className="success-dialog-terms">
            <KeyValue label={dialogCopy.successRecipient} value={shortAddress(success.recipient)} />
          </KeyValueList>
          <a className="success-dialog-tx" href={suiExplorerTxUrl(success.digest)} target="_blank" rel="noreferrer">
            {dialogCopy.viewTransaction} — {shortId(success.digest)}
          </a>
          <Button className="success-dialog-cta" onClick={resetAndClose}>
            {dialogCopy.done}
          </Button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open
      onClose={resetAndClose}
      ariaLabel={dialogCopy.title}
      closeLabel={copy.common.close}
      className="wallet-dialog-shell"
    >
      <div className={isPending ? 'wallet-dialog is-pending' : 'wallet-dialog'} aria-busy={isPending}>
        <h3 className="wallet-dialog-title">{dialogCopy.title}</h3>
        <p className="wallet-dialog-intro">{dialogCopy.intro}</p>
        <div className="wallet-send-form">
          <InputField
            label={dialogCopy.recipientLabel}
            placeholder={dialogCopy.recipientPlaceholder}
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
          {recipient.trim().length > 0 && !recipientValid ? (
            <p className="wallet-field-error">{dialogCopy.recipientInvalid}</p>
          ) : isSelfSend ? (
            <p className="wallet-field-warning">{dialogCopy.selfSendWarning}</p>
          ) : null}
          <div className="wallet-amount-row">
            <InputField
              label={dialogCopy.amountLabel}
              placeholder="0.00"
              inputMode="decimal"
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
              suffix={
                <span className="wallet-amount-suffix">
                  <span className="wallet-amount-unit">dUSDC</span>
                  <button type="button" className="wallet-max-button" onClick={fillMax}>
                    {dialogCopy.max}
                  </button>
                </span>
              }
            />
          </div>
          <button
            type="button"
            className="wallet-balance-hint"
            onClick={fillMax}
            disabled={funds.available === null}
          >
            {funds.available !== null ? dialogCopy.availableBalance(fmt.cashAmount(funds.available)) : '—'}
          </button>
          {amountText.trim().length > 0 && !amountValid ? (
            <p className="wallet-field-error">{dialogCopy.amountInvalid}</p>
          ) : exceedsBalance ? (
            <p className="wallet-field-error">{dialogCopy.exceedsBalance}</p>
          ) : null}
        </div>
        <p className="wallet-gas-note">{isEnokiSession ? copy.wallet.gasSponsored : copy.wallet.gasSelfPaid}</p>
        {error ? (
          <div className="wallet-error" role="alert">
            <p>{dialogCopy.failed}</p>
            <details>
              <summary>{dialogCopy.errorDetails}</summary>
              <code>{error}</code>
            </details>
          </div>
        ) : null}
        <Button className="wallet-dialog-cta" disabled={!canSubmit} onClick={() => void handleSend()}>
          {isPending ? (
            <>
              <span className="wallet-cta-spinner" aria-hidden="true" /> {dialogCopy.sending}
            </>
          ) : amountValid && !exceedsBalance ? (
            dialogCopy.confirmWithAmount(fmt.cashAmount(Number(amountBaseUnits) / 10 ** 6))
          ) : (
            dialogCopy.confirm
          )}
        </Button>
      </div>
    </Dialog>
  );
}
