const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
require('dotenv').config();

async function fixAdmin() {
  try {
    const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/color-prediction';
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const hashedPassword = await bcrypt.hash('admin123', 10);

    const result = await User.findOneAndUpdate(
      { username: 'admin' },
      { 
        $set: { 
          password: hashedPassword, 
          isAdmin: true 
        } 
      },
      { upsert: true, new: true }
    );

    console.log('👑 Admin user successfully verified and updated!');
    console.log(`👤 Username: ${result.username}`);
    console.log(`🔑 Password: admin123`);
    console.log(`🛡️ isAdmin Status: ${result.isAdmin}`);
    process.exit();
  } catch (err) {
    console.error('❌ Error fixing admin:', err);
    process.exit(1);
  }
}

fixAdmin();