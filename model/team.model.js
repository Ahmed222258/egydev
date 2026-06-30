const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema(
  {
    teamName: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    logo: {
      type: String,
      default: '',
    },
    country: {
      type: String,
      trim: true,
      default: '',
    },
    sport: {
      type: String,
      enum: ['Football', 'Basketball', 'Formula 1', 'Tennis', 'Cricket', 'Other'],
      default: 'Football',
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

teamSchema.index({ teamName: 'text' });
teamSchema.index({ sport: 1 });

module.exports = mongoose.model('Team', teamSchema);
