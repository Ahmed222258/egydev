const User = require('../model/user.model');
const jwt = require('jsonwebtoken');

const signToken = (user)=>{
return jwt.sign(
    {id: user._id, role:user.role,name:user.name},
    process.env.JWT_SECRET,
    {expiresIn: process.env.JWT_EXPIRES_IN || '1d'}
)
}

exports.login= async(req,res)=>{
    const {email,password}= req.body;
    const user = await User.findOne({email});
    if(!user || !(await user.correctPassword(password)))
    {
        return res.status(400).json({messgae:'Email or Passwrod invalid'})
    }
    const token = signToken(user);
    return res.status(200).json({message: 'you are logedin',token});
}