const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  address:String,
});

userSchema.pre('save',async function(next) {
   if(!this.isModified('password')) return next()
    this.password = await bcrypt.hash(this.password,10);
    next();
})

userSchema.methods.correctPassword = async function(inputPassword){
    return await bcrypt.compare(inputPassword,this.password);
}

module.exports = mongoose.model('User', userSchema);
