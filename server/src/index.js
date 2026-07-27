const express = require('express');
const cors = require('cors');
const path = require('path');

const { getDB } = require('./models/database');

const stagesRouter = require('./routes/stages');
const teamsRouter = require('./routes/teams');
const platformsRouter = require('./routes/platforms');
const reservationsRouter = require('./routes/reservations');
const dashboardRouter = require('./routes/dashboard');

const chipsRouter = require('./routes/chips');
const usersRouter = require('./routes/users');
const projectsRouter = require('./routes/projects');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', '..', 'client', 'dist')));

// API routes
app.use('/api/stages', stagesRouter);
app.use('/api/teams', teamsRouter);
app.use('/api/platforms', platformsRouter);
app.use('/api/reservations', reservationsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/chips', chipsRouter);
app.use('/api/users', usersRouter);
app.use('/api/projects', projectsRouter);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'client', 'dist', 'index.html'));
});

// 初始化数据库
getDB();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Hardware Reservation Platform running on http://0.0.0.0:${PORT}`);
  console.log(`[Server] API: http://localhost:${PORT}/api/health`);
});