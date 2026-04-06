const { app, connectToDatabase } = require('../backend/server');

module.exports = async (req, res) => {
    try {
        await connectToDatabase();
        return app(req, res);
    } catch (err) {
        console.error('API handler error:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
};
