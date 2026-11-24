require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const express = require('express');
const cors    = require('cors');

const app = express();
// Render (and most hosts) sit behind one reverse proxy; without this every
// request looks like it comes from the proxy's IP and IP rate limits break.
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());

app.get('/health', (_, res) => res.json({ status: 'ok' }));
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/tables',   require('./routes/tables'));
app.use('/api/players',  require('./routes/players'));
app.use('/api/sessions', require('./routes/sessions'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/reports',  require('./routes/reports'));
app.use('/api/rates',    require('./routes/rates'));

app.listen(process.env.PORT || 4000, () => {
  console.log(`Server running on port ${process.env.PORT || 4000}`);
});