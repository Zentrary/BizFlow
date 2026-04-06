const express = require('express');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');
let helmet = null;
try {
    helmet = require('helmet');
} catch (err) {}
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Error handling middleware
const errorHandler = (err, req, res, next) => {
    console.error('Error:', err);
    
    if (process.env.NODE_ENV === 'production') {
        // Don't expose error details in production
        res.status(500).json({ 
            message: 'Internal server error',
            errorId: Date.now()
        });
    } else {
        // Show full error in development
        res.status(500).json({ 
            message: err.message,
            stack: err.stack
        });
    }
};

const app = express();
const PORT = process.env.PORT || 3000;
const isProdEnv = process.env.NODE_ENV === 'production';

if (helmet) {
    if (isProdEnv) {
        app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https:", "http:"],
                    styleSrc: ["'self'", "'unsafe-inline'", "https:", "http:"],
                    imgSrc: ["'self'", "data:", "https:"],
                    fontSrc: ["'self'", "data:", "https:"],
                    connectSrc: ["'self'", "https:", "http:"],
                    objectSrc: ["'none'"],
                    frameAncestors: ["'self'"]
                }
            },
            crossOriginResourcePolicy: { policy: "same-site" }
        }));
    } else {
        app.use(helmet());
    }
}

const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

const parseOrigins = (v) => (v || '').split(',').map(s => s.trim()).filter(Boolean);
const defaultDevOrigins = ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:3001'];
const allowedOrigins = isProdEnv 
    ? parseOrigins(process.env.ALLOWED_ORIGIN) 
    : Array.from(new Set([...parseOrigins(process.env.ALLOWED_ORIGIN), ...defaultDevOrigins]));
app.use(cors({
    origin: function(origin, cb) {
        if (!origin) return cb(null, true);
        if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error('Not allowed by CORS'));
    },
    credentials: true
}));
app.use(express.json({ limit: '200kb' }));
app.use(cookieParser());

// CSRF helpers (enabled in production; double-submit cookie)
const generateCsrfToken = () => crypto.randomBytes(18).toString('hex');
const requireCsrf = (req, res, next) => {
    if (!isProdEnv) return next();
    const tokenCookie = req.cookies?.csrf || '';
    const tokenHeader = req.headers['x-csrf-token'] || '';
    if (!tokenCookie || !tokenHeader || tokenCookie !== tokenHeader) {
        return res.status(403).json({ message: 'Forbidden' });
    }
    next();
};

const authMiddleware = (req, res, next) => {
    const token = req.cookies?.token || null;
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = payload.userId;
        next();
    } catch {
        res.status(401).json({ message: 'Unauthorized' });
    }
};

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    changeLog: [{ type: { type: String }, at: { type: Date } }],
    blockedUntil: { type: Date }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);

const TransactionSchema = new mongoose.Schema({
    title: { type: String, required: true },
    amount: { type: Number, required: true },
    type: { type: String, required: true },
    category: { type: String },
    date: { type: String, required: true },
    method: { type: String },
    isPaid: { type: Boolean, default: false },
    userId: { type: String }
}, { timestamps: true });

const Transaction = mongoose.model('Transaction', TransactionSchema);

let dbConnectPromise = null;
const connectToDatabase = async () => {
    if (mongoose.connection.readyState === 1) return mongoose.connection;
    if (mongoose.connection.readyState === 2 && dbConnectPromise) return dbConnectPromise;

    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI is not set');
    if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not set');

    dbConnectPromise = mongoose.connect(uri, {
        dbName: process.env.MONGODB_DB || undefined
    }).finally(() => {
        dbConnectPromise = null;
    });

    return dbConnectPromise;
};

// Validation helpers
const ALLOWED_TYPES = new Set(['income', 'expense', 'debt', 'payable']);
const ALLOWED_METHODS = new Set(['cash', 'transfer']);
const isValidDateStr = (s) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s);
    if (isNaN(d.getTime())) return false;
    return d.toISOString().slice(0,10) === s;
};
const validateTransactionPayload = (body) => {
    const title = String(body.title || '').trim();
    const amount = Number(body.amount);
    const type = String(body.type || '').trim();
    const category = String(body.category || '').trim();
    const date = String(body.date || '').trim();
    const method = String(body.method || '').trim() || 'cash';
    if (!title || title.length > 200) return 'Invalid title';
    if (!Number.isFinite(amount) || amount < 0) return 'Invalid amount';
    if (!ALLOWED_TYPES.has(type)) return 'Invalid type';
    if (!isValidDateStr(date)) return 'Invalid date';
    if (!ALLOWED_METHODS.has(method)) return 'Invalid method';
    // category optional; allow empty
    return null;
};

app.get('/', (req, res) => {
    res.send('SME Money Manager API is running');
});

app.post(['/auth/register', '/api/auth/register'], async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) return res.status(400).json({ message: 'Bad request' });
        const usernameNorm = String(username).trim().toLowerCase();
        const emailNorm = String(email).trim().toLowerCase();
        const taken = await User.findOne({ $or: [{ username: usernameNorm }, { email: emailNorm }] }).lean();
        if (taken) return res.status(409).json({ message: 'Conflict' });
        const hashed = await bcrypt.hash(password, parseInt(process.env.BCRYPT_ROUNDS) || 12);
        const doc = await User.create({ username: usernameNorm, email: emailNorm, password: hashed });
        res.status(201).json({ id: String(doc._id), username: doc.username, email: doc.email });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

app.post(['/auth/login', '/api/auth/login'], async (req, res) => {
    try {
        const { loginId, password } = req.body;
        if (!loginId || !password) return res.status(400).json({ message: 'Bad request' });
        const lower = String(loginId).toLowerCase();
        const user = await User.findOne({ $or: [{ username: lower }, { email: lower }] });
        if (!user) return res.status(401).json({ message: 'Unauthorized' });
        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return res.status(401).json({ message: 'Unauthorized' });
        const token = jwt.sign({ userId: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '7d' });
        const isProd = isProdEnv;
        res.cookie('token', token, { httpOnly: true, secure: isProd, sameSite: isProd ? 'strict' : 'lax', maxAge: 7 * 24 * 3600 * 1000, path: '/' });
        const csrf = generateCsrfToken();
        // CSRF cookie must be readable by JS
        res.cookie('csrf', csrf, { httpOnly: false, secure: isProd, sameSite: isProd ? 'strict' : 'lax', maxAge: 2 * 24 * 3600 * 1000, path: '/' });
        res.json({ username: user.username, email: user.email });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

app.post(['/auth/logout', '/api/auth/logout'], requireCsrf, (req, res) => {
    res.clearCookie('token');
    if (req.cookies?.csrf) res.clearCookie('csrf');
    res.status(204).send();
});

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const NAME_CHANGE_LIMIT = parseInt(process.env.NAME_CHANGE_LIMIT) || 3;
const PASSWORD_CHANGE_LIMIT = parseInt(process.env.PASSWORD_CHANGE_LIMIT) || 2;
const CHANGE_MIN_INTERVAL_SEC = parseInt(process.env.CHANGE_MIN_INTERVAL_SEC) || 600;

app.post(['/auth/change-username', '/api/auth/change-username'], authMiddleware, requireCsrf, async (req, res) => {
    try {
        const { newUsername } = req.body;
        const normalized = String(newUsername || '').trim().toLowerCase();
        if (!normalized) return res.status(400).json({ message: 'Bad request' });
        const exists = await User.findOne({ username: normalized }).lean();
        if (exists) return res.status(409).json({ message: 'Conflict' });
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ message: 'Not found' });
        const now = new Date();
        if (user.blockedUntil && user.blockedUntil > now) return res.status(429).json({ message: 'Blocked' });
        const sod = startOfDay(now);
        const todayLogs = (user.changeLog || []).filter(l => l.at && l.at >= sod);
        const nameChangesToday = todayLogs.filter(l => l.type === 'name').length;
        if (nameChangesToday >= NAME_CHANGE_LIMIT) {
            user.blockedUntil = endOfDay(now);
            await user.save();
            return res.status(429).json({ message: 'Blocked' });
        }
        const lastChange = todayLogs.length ? todayLogs[todayLogs.length - 1] : null;
        if (lastChange && ((now - new Date(lastChange.at)) / 1000) < CHANGE_MIN_INTERVAL_SEC) {
            user.blockedUntil = endOfDay(now);
            await user.save();
            return res.status(429).json({ message: 'Blocked' });
        }
        user.username = normalized;
        user.changeLog = [...(user.changeLog || []), { type: 'name', at: now }];
        await user.save();
        res.json({ username: user.username });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

app.post(['/auth/change-password', '/api/auth/change-password'], authMiddleware, requireCsrf, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        const np = String(newPassword || '');
        if (!currentPassword || np.length < 6) return res.status(400).json({ message: 'Bad request' });
        const user = await User.findById(req.userId);
        if (!user) return res.status(404).json({ message: 'Not found' });
        const now = new Date();
        if (user.blockedUntil && user.blockedUntil > now) return res.status(429).json({ message: 'Blocked' });
        const ok = await bcrypt.compare(currentPassword, user.password);
        if (!ok) return res.status(401).json({ message: 'Unauthorized' });
        const sod = startOfDay(now);
        const todayLogs = (user.changeLog || []).filter(l => l.at && l.at >= sod);
        const passChangesToday = todayLogs.filter(l => l.type === 'password').length;
        if (passChangesToday >= PASSWORD_CHANGE_LIMIT) {
            user.blockedUntil = endOfDay(now);
            await user.save();
            return res.status(429).json({ message: 'Blocked' });
        }
        const lastChange = todayLogs.length ? todayLogs[todayLogs.length - 1] : null;
        if (lastChange && ((now - new Date(lastChange.at)) / 1000) < CHANGE_MIN_INTERVAL_SEC) {
            user.blockedUntil = endOfDay(now);
            await user.save();
            return res.status(429).json({ message: 'Blocked' });
        }
        const hashed = await bcrypt.hash(np, parseInt(process.env.BCRYPT_ROUNDS) || 12);
        user.password = hashed;
        user.changeLog = [...(user.changeLog || []), { type: 'password', at: now }];
        await user.save();
        res.status(204).send();
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

app.get(['/api/transactions', '/transactions'], authMiddleware, async (req, res) => {
    try {
        const q = { userId: req.userId };
        const page = parseInt(req.query.page || '');
        const limit = parseInt(req.query.limit || '');
        let rowsQuery = Transaction.find(q).sort({ date: -1, createdAt: -1 });
        let total = null;
        if (!isNaN(page) && page > 0 && !isNaN(limit) && limit > 0) {
            const p = Math.min(page, 10000);
            const l = Math.min(limit, 100);
            total = await Transaction.countDocuments(q);
            rowsQuery = rowsQuery.skip((p - 1) * l).limit(l);
        }
        const rows = await rowsQuery.lean();
        const mapped = rows.map(r => ({
            id: String(r._id),
            title: r.title,
            amount: r.amount,
            type: r.type,
            category: r.category,
            date: r.date,
            method: r.method,
            isPaid: !!r.isPaid
        }));
        if (total !== null) {
            res.json({ items: mapped, page, limit, total });
        } else {
            res.json(mapped);
        }
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

app.post(['/api/transactions', '/transactions'], authMiddleware, requireCsrf, async (req, res) => {
    try {
        const { title, amount, type, category, date, method, isPaid } = req.body;
        const errMsg = validateTransactionPayload({ title, amount, type, category, date, method });
        if (errMsg) return res.status(400).json({ message: errMsg });
        const doc = await Transaction.create({ title, amount, type, category, date, method, isPaid: !!isPaid, userId: req.userId });
        res.status(201).json({
            id: String(doc._id),
            title: doc.title,
            amount: doc.amount,
            type: doc.type,
            category: doc.category,
            date: doc.date,
            method: doc.method,
            isPaid: !!doc.isPaid
        });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

app.put(['/api/transactions/:id', '/transactions/:id'], authMiddleware, requireCsrf, async (req, res) => {
    try {
        const id = req.params.id;
        const { title, amount, type, category, date, method, isPaid } = req.body;
        const errMsg = validateTransactionPayload({ title, amount, type, category, date, method });
        if (errMsg) return res.status(400).json({ message: errMsg });
        const updated = await Transaction.findOneAndUpdate(
            { _id: id, userId: req.userId },
            { title, amount, type, category, date, method, isPaid: !!isPaid },
            { new: true }
        ).lean();
        if (!updated) {
            res.status(404).json({ message: 'Not found' });
            return;
        }
        res.json({
            id: String(updated._id),
            title: updated.title,
            amount: updated.amount,
            type: updated.type,
            category: updated.category,
            date: updated.date,
            method: updated.method,
            isPaid: !!updated.isPaid
        });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

app.delete(['/api/transactions/:id', '/transactions/:id'], authMiddleware, requireCsrf, async (req, res) => {
    try {
        const id = req.params.id;
        const deleted = await Transaction.findOneAndDelete({ _id: id, userId: req.userId }).lean();
        if (!deleted) {
            res.status(404).json({ message: 'Not found' });
            return;
        }
        res.status(204).send();
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// Serve frontend statically for local development
app.use(express.static(path.resolve(__dirname, '..')));

// Error handling middleware (must be last)
app.use(errorHandler);

module.exports = { app, connectToDatabase };

const start = async () => {
    try {
        if (!isProdEnv) {
            console.log('=== DEBUG INFO ===');
            console.log('MONGODB_URI:', process.env.MONGODB_URI ? 'SET' : 'NOT SET');
            console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'SET' : 'NOT SET');
            console.log('BCRYPT_ROUNDS:', process.env.BCRYPT_ROUNDS || 'NOT SET');
            console.log('NODE_ENV:', process.env.NODE_ENV);
            console.log('VERCEL:', process.env.VERCEL);
            console.log('==================');
        }

        if (!isProdEnv) console.log('Attempting to connect to MongoDB...');
        await connectToDatabase();
        console.log('MongoDB connected successfully');

        if (process.env.VERCEL !== '1') {
            app.listen(PORT, () => {
                console.log(`Server is running on http://localhost:${PORT}`);
            });
        }
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        console.error('Full error:', err);
        if (process.env.VERCEL !== '1') {
            process.exit(1);
        }
    }
};

if (process.env.VERCEL !== '1') {
    start();
}

