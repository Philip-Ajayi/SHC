require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const cors = require('cors');
const Stripe = require('stripe');
const path = require('path');

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cors({ origin: process.env.FRONTEND_URL }));

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// User schema and model
const userSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  phone: String,
  email: { type: String, unique: true, required: true },
  address: String,
  year: { 
    type: Number, 
    default: () => new Date().getFullYear() 
  },
  attendance: { type: [Number], default: [] },
  unsubscribed: { type: Boolean, default: false }
});

const User = mongoose.model('User', userSchema);

// Nodemailer Setup (Zoho)
const transporter = nodemailer.createTransport({
  host: 'smtp.zoho.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.ZOHO_EMAIL,
    pass: process.env.ZOHO_PASSWORD
  }
});

// User Registration
app.post('/api/register', async (req, res) => {
  const { firstName, lastName, phone, email, address, year } = req.body;

  try {
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: 'A user with this email already exists.' });
    }

    const newUser = new User({ firstName, lastName, phone, email, address, year });
    await newUser.save();

    const mailOptions = {
      from: process.env.ZOHO_EMAIL,
      to: email,
      subject: 'Registration Successful – SHC’25',
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2 style="color: #2c3e50;">Hello ${firstName},</h2>
          <p>Thank you for registering for <strong>SHC’25</strong>! We are excited to receive you.</p>
          
          <p>Please be sure to check the website for important information concerning the meeting.</p>
          
          <p>In the meantime, feel free to explore our website at 
            <a href="https://supernaturalcc.org" target="_blank" style="color: #1e90ff;">Supernaturalcc.org</a> 
            for resources that will bless you.
          </p>
          
          <p style="margin-top: 30px;">See you this summer at the <strong>Summer Healing Campaign '25</strong>!</p>
          
          <p>Looking forward to receiving you,</p>
          <p style="font-weight: bold;">Ayo Benson</p>
        </div>
      `
    };


    try {
      await transporter.sendMail(mailOptions);
      console.log(`Registration email sent to ${email}`);
      res.status(200).json({ message: 'Registration successful and email sent!' });
    } catch (mailErr) {
      console.error('Error sending email:', mailErr);
      res.status(200).json({ message: 'Registered, but failed to send confirmation email.' });
    }
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// Attendance Management
app.post('/api/mark-attendance', async (req, res) => {
  const { email, session, year } = req.body;

  try {
    const user = await User.findOne({ email, year });
    if (!user) return res.status(404).json({ message: 'User not found for this year.' });

    if (!user.attendance.includes(session)) {
      user.attendance.push(session);
      await user.save();
      return res.status(200).json({ message: `Attendance marked for session ${session}.` });
    }

    res.status(400).json({ message: 'Attendance already marked for this session.' });
  } catch (err) {
    console.error('Error marking attendance:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

app.get('/api/check-attendance', async (req, res) => {
  const { email, session, year } = req.query;

  try {
    const user = await User.findOne({ email, year });
    if (!user) {
      return res.status(404).json({ message: 'User not found for this year.' });
    }

    const attendanceMarked = user.attendance.includes(Number(session));
    res.status(200).json({ attendanceMarked });
  } catch (err) {
    console.error('Error checking attendance:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});


app.post('/api/remove-attendance', async (req, res) => {
  const { email, session, year } = req.body;

  try {
    const user = await User.findOne({ email, year });
    if (!user) return res.status(404).json({ message: 'User not found for this year.' });

    const idx = user.attendance.indexOf(session);
    if (idx > -1) {
      user.attendance.splice(idx, 1);
      await user.save();
      return res.status(200).json({ message: `Attendance removed for session ${session}.` });
    }

    res.status(400).json({ message: 'Attendance not found for this session.' });
  } catch (err) {
    console.error('Error removing attendance:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// Queries
app.get('/api/attendance/:session/:year', async (req, res) => {
  const { session, year } = req.params;
  try {
    const users = await User.find({ attendance: +session, year: +year });
    res.status(200).json({ users });
  } catch (err) {
    console.error('Error fetching attendance:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

app.get('/api/users/:year', async (req, res) => {
  const { year } = req.params;
  try {
    const users = await User.find({ year: +year });
    if (!users.length) {
      return res.status(404).json({ message: `No users found for year ${year}.` });
    }
    res.status(200).json({ users });
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

app.get('/api/users-no-attendance/:year', async (req, res) => {
  const { year } = req.params;
  try {
    const users = await User.find({ year: +year, attendance: { $size: 0 } });
    res.status(200).json({ users });
  } catch (err) {
    console.error('Error fetching users with no attendance:', err);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

// Contact Form
app.post('/api/contact', async (req, res) => {
  const { name, email, phone, message, reason } = req.body;

  let subject, body;
  switch (reason) {
    case 'prayer_request':
      subject = `${name} needs prayer`;
      body = `${name} needs prayer.\n\nEmail: ${email}\nPhone: ${phone}\nMessage: ${message}`;
      break;
    case 'ask_question':
      subject = `${name} has a question`;
      body = `${name} has a question.\n\nEmail: ${email}\nPhone: ${phone}\nMessage: ${message}`;
      break;
    case 'get_involved':
      subject = `${name} wants to get involved`;
      body = `${name} wants to get involved.\n\nEmail: ${email}\nPhone: ${phone}\nMessage: ${message}`;
      break;
    default:
      subject = 'New Contact Form Submission';
      body = `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\nMessage: ${message}`;
  }

  try {
    await transporter.sendMail({
      from: process.env.ZOHO_EMAIL,
      to: process.env.CONTACT_RECEIVER_EMAIL,
      subject,
      text: body
    });
    res.status(200).json({ message: 'Message sent successfully!' });
  } catch (err) {
    console.error('Error sending contact email:', err);
    res.status(500).json({ message: 'Something went wrong.' });
  }
});

// Broadcasts
app.post('/api/send-user-broadcast', async (req, res) => {
  const { customHtml } = req.body;
  try {
    const users = await User.find({ unsubscribed: false });
    if (!users.length) {
      return res.status(404).json({ message: 'No users to send the message to.' });
    }

    const sendOps = users.map(u => {
      const unsubscribeLink = `/unsubscribe/${u._id}`;
      const unsubscribeDirect = `/api/unsubscribe/${u._id}`;
      const html = `
        <p>Hello ${u.firstName},</p>
        ${customHtml}
        <hr />
        <p><a href="${unsubscribeLink}">Unsubscribe</a></p>
      `;
      return transporter.sendMail({
        from: process.env.ZOHO_EMAIL,
        to: u.email,
        subject: 'Important Update',
        html,
        headers: {
      'List-Unsubscribe': `<${unsubscribeDirect}>`
    }
      });
    });
    await Promise.all(sendOps);
    res.status(200).json({ message: `Broadcast sent to ${users.length} users.` });
  } catch (err) {
    console.error('Error sending broadcast:', err);
    res.status(500).json({ message: 'Failed to send broadcast.' });
  }
});

// Unsubscribe endpoint (GET for link clicks)
app.get('/api/unsubscribe/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).send('User not found.');
    user.unsubscribed = true;
    await user.save();
    res.send('<h1>You have been unsubscribed.</h1>');
  } catch (err) {
    console.error('Error unsubscribing:', err);
    res.status(500).send('Server error.');
  }
});

// Stripe Checkout Session
app.post('/api/create-checkout-session', async (req, res) => {
  const { amount, name, email, type, event } = req.body;
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: type === 'event' ? `Support Event: ${event}` : 'General Offering',
            description: type === 'event' ? `Donation for event: ${event}` : 'General church offering'
          },
          unit_amount: Math.round(amount * 100)
        },
        quantity: 1
      }],
      mode: 'payment',
      customer_email: email,
      success_url: `https://summerhealingcampaign.org/payment-success`,
      cancel_url: `https://summerhealingcampaign.org/payment-error`,
      metadata: {
        donor_name: name,
        donation_type: type
      }
    });
    res.json({ id: session.id });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Serve static files from the "dist" directory
app.use(express.static(path.join(__dirname, 'dist')));

// Optional: fallback to index.html for Single Page Applications (e.g., React/Vue)
app.get('*', (req, res) => {
  res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
});

// Start Server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
