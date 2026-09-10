import artifact from '../../contracts/build/AnkerNote.json';

export const ANKER_NOTE_ABI = artifact.abi;

/**
 * Deployed AnkerNote address.
 *
 * Not a literal in source: filled by `npm run contract:deploy`, which writes
 * contracts/deployments/testnet.json and prints the env line. Undefined until
 * then, and the portfolio says so rather than silently reading address zero.
 */
export const ANKER_NOTE_ADDRESS = (process.env.NEXT_PUBLIC_ANKER_NOTE_ADDRESS ?? '') as `0x${string}` | '';

export const isNoteContractConfigured = () => /^0x[0-9a-fA-F]{40}$/.test(ANKER_NOTE_ADDRESS);
