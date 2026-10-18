// Vercel gives this Fire TV endpoint its own function so password pairing is
// available even when the root catch-all is not selected for this path.
const { createRequestHandler } = require("../../server");

module.exports = createRequestHandler();
