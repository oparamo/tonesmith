// Redirected into a file or piped into another command, an escape sequence is literal garbage in
// the destination rather than color, so ask the same two questions every colored CLI asks.
const colored = process.stdout.isTTY && !process.env.NO_COLOR;
const sgr = (code: string): string => (colored ? `\x1b[${code}m` : "");

const RESET  = sgr("0");
const BOLD   = sgr("1");
const DIM    = sgr("2");
const CYAN   = sgr("36");
const YELLOW = sgr("33");
const GREEN  = sgr("32");

export { RESET, BOLD, DIM, CYAN, YELLOW, GREEN };
