const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();

// Enhanced CORS configuration
app.use(cors({
  origin: 'https://free-mini-games.vercel.app',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(bodyParser.json());
app.use(express.static(__dirname));

// MongoDB connection with error handling
mongoose.connect('mongodb://localhost:27017/gamehub', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  retryWrites: true
})
.then(() => console.log('✅ MongoDB connected successfully'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// User Schema with strict validation
const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30
  },
  password: { 
    type: String, 
    required: true,
    minlength: 6
  },
  highScores: {
    haveyouseen: { type: Number, default: 0 },
    memmatch: { type: Number, default: 0 },
    numbermem: { type: Number, default: 0 },
    reaction: { type: Number, default: Infinity }, // Lower is better
    sequence: { type: Number, default: 0 },
    tictactoe: { type: Number, default: 0 }
  },
  lastUpdated: { type: Date, default: Date.now }
}, { strict: true }); // Strict mode prevents undefined fields

const User = mongoose.model('User', userSchema);

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your_secure_jwt_secret_key';
const JWT_EXPIRES_IN = '1h';

// Authentication middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).send('Access denied. No token provided.');

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).send('Invalid or expired token.');
    req.user = decoded;
    next();
  });
}

// API Routes
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validation
    if (!username || !password) {
      return res.status(400).send('Username and password are required.');
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(400).send('Username already exists.');
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = new User({ username, password: hashedPassword });
    await user.save();

    // Generate token for immediate login
    const token = jwt.sign(
      { userId: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.status(201).json({ 
      message: 'User created successfully',
      token,
      user: { id: user._id, username: user.username }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).send('Error registering user.');
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).send('Username and password are required.');
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).send('Invalid username or password.');
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).send('Invalid username or password.');
    }

    const token = jwt.sign(
      { userId: user._id, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({ 
      message: 'Login successful',
      token,
      user: { id: user._id, username: user.username }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).send('Error logging in.');
  }
});

app.get('/api/highscores', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('highScores lastUpdated');
    if (!user) {
      return res.status(404).send('User not found.');
    }
    res.json({
      ...user.highScores.toObject(),
      lastUpdated: user.lastUpdated
    });
  } catch (error) {
    console.error('Highscores fetch error:', error);
    res.status(500).send('Error fetching high scores.');
  }
});

app.post('/api/update-highscore', authenticateToken, async (req, res) => {
  try {
    const { game, score } = req.body;
    
    // Validate input
    if (!game || score === undefined || score === null) {
      return res.status(400).send('Game and score are required.');
    }

    const validGames = ['haveyouseen', 'memmatch', 'numbermem', 'reaction', 'sequence', 'tictactoe'];
    if (!validGames.includes(game)) {
      return res.status(400).send('Invalid game specified.');
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).send('User not found.');
    }

    // Update logic
    let updated = false;
    if (game === 'reaction') {
      if (score < user.highScores.reaction) {
        user.highScores.reaction = score;
        updated = true;
      }
    } else if (score > user.highScores[game]) {
      user.highScores[game] = score;
      updated = true;
    }

    if (updated) {
      user.lastUpdated = new Date();
      await user.save();
      res.json({ 
        success: true,
        message: 'High score updated successfully',
        highScores: user.highScores,
        lastUpdated: user.lastUpdated
      });
    } else {
      res.json({
        success: false,
        message: 'Score not higher than current high score',
        highScores: user.highScores
      });
    }
  } catch (error) {
    console.error('Highscore update error:', error);
    res.status(500).send('Error updating high score.');
  }
});

// Static file routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'signup.html'));
});

// Game routes
const games = ['haveyouseen', 'memmatch', 'numbermem', 'reaction', 'sequence', 'tictactoe'];
games.forEach(game => {
  app.get(`/${game}`, (req, res) => {
    res.sendFile(path.join(__dirname, `${game}.html`));
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).send('Internal server error.');
});

// Start server
const PORT = process.env.PORT || 3004;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed.');
    process.exit(0);
  } catch (err) {
    console.error('Shutdown error:', err);
    process.exit(1);
  }
});

6