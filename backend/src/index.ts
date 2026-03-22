import express from 'express';
import cors from 'cors';
import connectionRoutes from './routes/connections.js';
import metadataRoutes from './routes/metadata.js';
import queryRoutes from './routes/query.js';
import advancedRoutes from './routes/advanced.js';
import dumpRoutes from './routes/dump.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use('/api/connections', connectionRoutes);
app.use('/api/metadata', metadataRoutes);
app.use('/api/query', queryRoutes);
app.use('/api/advanced', advancedRoutes);
app.use('/api/dump', dumpRoutes);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`PgIDE Backend running on http://localhost:${PORT}`);
});
