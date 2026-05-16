const express = require('express');
const webpush = require('web-push');
const cors = require('cors');
const cron = require('node-cron');

const app = express();
app.use(express.json());
app.use(cors());

// ---- VAPID KEYS ----
// These are generated on first run and stored in memory
// In production you'd store these in environment variables
const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY
};

webpush.setVapidDetails(
  'mailto:' + (process.env.VAPID_EMAIL || 'peepshow@example.com'),
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

// ---- IN MEMORY STORE ----
let subscription = null;
let intervalMinutes = 15;
let isRunning = false;
let cronJob = null;
let quotes = [
  "People like Coldplay and voted for the Nazis, you can't trust people.",
  "Tell you what, that crack is really moreish.",
  "The secret ingredient, is crime.",
  "You ate your nest egg? You're meant to sit on your nest egg til it hatches, not eat it like some greedy, mad chicken.",
  "Just open your gob and someone will slip in something tasty. A pill. A nipple. Bit of fried halloumi. Lovely.",
  "Why do you have to see the anus as some sort of human USB port.",
  "I done the downloading, and then I done a wank.",
  "Don't be scared... I am scared.",
  "It's not a fucking love story, it's a fucking fuck story.",
  "What we really want to do is create a powerful sense of dread.",
  "Plumbing's just fuckin' Lego innit. Water Lego.",
  "Stick that up your dojo.",
  "Not the Hootenanny! Never the Hootenanny.",
  "Is this a terrible idea? It can't be, it's in a film. They wouldn't put a terrible idea in a film.",
  "No! Stop trying to marry everyone Mark. No need to marry people.",
  "I AM James Bond.",
  "Thoughts? You wanna cut that shit out.",
  "Mummy... coffee... fuckkeee hurry uppeee.",
  "Jeff's doin a joke, everybody QUIET cause Jeff's doin a joke.",
  "All cocks are jizz-cocks, it's a bit like calling him a piss kidney.",
  "You like people from the past don't you Mark? Like Napoleon.",
  "That's a car crash of a shopping basket.",
  "I don't want sweet punani action, I want to take your bishop and grind you down.",
  "You want to trick the boiler?",
  "The last beemer out of Saigon.",
  "That's not good melon.",
  "Piece by piece dude.",
  "Oh no we're getting fucked by the brush.",
  "Love to mate, love to, but this is all mine and... I want it all, so: gotta be a no.",
  "Nim Nim fucking Nim!",
  "You assured me that he'd made a HUGE lemon meringue pie!",
  "Stick a truncheon up the arris for this one.",
  "Did you try to get me sectioned?",
  "Who wants to clog the filter? Lunatics!",
  "Great, now I'm getting an angry lapdance.",
  "Would you get me a kebab?",
  "Minimal water damage.",
  "We are not the Hair Blair Bunch!",
  "It's not a no-brainer! I have to think about it. It's a brainer. A real brainer.",
  "Super Hans says he's come up with a bass loop for our track that is so good that when he tried turning it off, he literally couldn't.",
  "Guys, you've had your fun with the sectioning. There's going to be no more sectioning today.",
  "All cocks are jizz cocks really. It's a bit like calling him a piss kidney.",
  "Oh, piss yourself. Stop pissing yourself. It's not that simple! The floodgates are open!",
  "A snog is not an affair. You've come here to call off a wedding because of a drunken snog?",
  "Why do you always think the Yardies are the answer to everything?",
  "If it looks like a life coach and it's got a certificate saying that it's a life coach, then it's probably a life coach."
];

// Smarter randomness - tracks recently used quotes to avoid repeats
let recentQuotes = [];
function getRandom() {
  const halfLength = Math.floor(quotes.length / 2);
  let available = quotes.filter(q => !recentQuotes.includes(q));
  if (available.length === 0) {
    recentQuotes = [];
    available = [...quotes];
  }
  const quote = available[Math.floor(Math.random() * available.length)];
  recentQuotes.push(quote);
  if (recentQuotes.length > halfLength) recentQuotes.shift();
  return quote;
}

function sendQuote() {
  if (!subscription) return;
  const quote = getRandom();
  webpush.sendNotification(subscription, JSON.stringify({
    title: 'Peep Show 📺',
    body: quote
  })).catch(err => {
    console.error('Push error:', err);
    if (err.statusCode === 410) {
      // Subscription expired
      subscription = null;
      stopCron();
    }
  });
}

function startCron() {
  stopCron();
  isRunning = true;
  // Send first one immediately
  sendQuote();
  // Then schedule recurring
  const cronExpr = `*/${intervalMinutes} * * * *`;
  cronJob = cron.schedule(cronExpr, sendQuote);
  console.log(`Cron started: every ${intervalMinutes} mins`);
}

function stopCron() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
  }
  isRunning = false;
  console.log('Cron stopped');
}

// ---- ROUTES ----

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', running: isRunning, interval: intervalMinutes });
});

// Get VAPID public key
app.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

// Save push subscription from browser
app.post('/subscribe', (req, res) => {
  subscription = req.body;
  console.log('Subscription saved');
  res.json({ ok: true });
});

// Get current state
app.get('/state', (req, res) => {
  res.json({
    running: isRunning,
    interval: intervalMinutes,
    quotes: quotes,
    hasSubscription: !!subscription
  });
});

// Start notifications
app.post('/start', (req, res) => {
  if (req.body.interval) intervalMinutes = parseInt(req.body.interval);
  if (!subscription) return res.status(400).json({ error: 'No subscription' });
  startCron();
  res.json({ ok: true, running: true, interval: intervalMinutes });
});

// Stop notifications
app.post('/stop', (req, res) => {
  stopCron();
  res.json({ ok: true, running: false });
});

// Update quotes
app.post('/quotes', (req, res) => {
  quotes = req.body.quotes;
  res.json({ ok: true, quotes });
});

// Update interval (while running)
app.post('/interval', (req, res) => {
  intervalMinutes = parseInt(req.body.interval);
  if (isRunning) startCron();
  res.json({ ok: true, interval: intervalMinutes });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// Keep-alive ping every 5 minutes to prevent Render free tier sleeping
const https = require('https');
setInterval(() => {
  const url = process.env.RENDER_EXTERNAL_URL || 'https://peepshow-server.onrender.com';
  https.get(url, (res) => {
    console.log(`Keep-alive ping: ${res.statusCode}`);
  }).on('error', (e) => {
    console.log(`Keep-alive error: ${e.message}`);
  });
}, 5 * 60 * 1000);
