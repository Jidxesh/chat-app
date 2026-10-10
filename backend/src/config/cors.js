// CLIENT_URL may be one origin, a comma-separated list, or * (any origin)
const raw = (process.env.CLIENT_URL || '*').split(',').map((s) => s.trim()).filter(Boolean);
const corsOrigin = raw.includes('*') ? '*' : raw;

module.exports = { corsOrigin };
