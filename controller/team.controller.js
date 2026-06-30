const Team = require('../model/team.model');
const logger = require('../utils/logger.util');

// ── Create Team ───────────────────────────────────────────────────────────────
exports.createTeam = async (req, res) => {
  try {
    const { teamName, country, sport } = req.body;

    if (!teamName || !teamName.trim()) {
      return res.status(400).json({ message: 'Team name is required' });
    }

    const existing = await Team.findOne({ teamName: teamName.trim(), isDeleted: false });
    if (existing) {
      return res.status(400).json({ message: 'Team already exists' });
    }

    const team = await Team.create({
      teamName: teamName.trim(),
      country: country?.trim() || '',
      sport: sport || 'Football',
      logo: req.file?.filename || '',
    });

    logger.info(`Team created: ${team._id} - ${team.teamName}`);
    res.status(201).json({ message: 'Team created successfully', data: team });
  } catch (err) {
    logger.error(`Create Team Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to create team', error: err.message });
  }
};

// ── Get All Teams ─────────────────────────────────────────────────────────────
exports.getAllTeams = async (req, res) => {
  try {
    const { sport, search } = req.query;
    const filter = { isDeleted: false };

    if (sport) filter.sport = sport;
    if (search) filter.$text = { $search: search };

    const teams = await Team.find(filter).sort({ teamName: 1 });
    res.status(200).json({ message: 'List of teams', count: teams.length, data: teams });
  } catch (err) {
    logger.error(`Get Teams Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to retrieve teams', error: err.message });
  }
};

// ── Get Team By ID ────────────────────────────────────────────────────────────
exports.getTeamById = async (req, res) => {
  try {
    const team = await Team.findOne({ _id: req.params.id, isDeleted: false });
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }
    res.status(200).json({ message: 'Team data', data: team });
  } catch (err) {
    logger.error(`Get Team Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to retrieve team', error: err.message });
  }
};

// ── Update Team ───────────────────────────────────────────────────────────────
exports.updateTeam = async (req, res) => {
  try {
    const { teamName, country, sport } = req.body;
    const updateData = {};

    if (teamName) updateData.teamName = teamName.trim();
    if (country !== undefined) updateData.country = country.trim();
    if (sport) updateData.sport = sport;
    if (req.file) updateData.logo = req.file.filename;

    const team = await Team.findByIdAndUpdate(req.params.id, updateData, { new: true });
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    logger.info(`Team updated: ${team._id}`);
    res.status(200).json({ message: 'Team updated', data: team });
  } catch (err) {
    logger.error(`Update Team Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to update team', error: err.message });
  }
};

// ── Soft Delete / Restore Team ────────────────────────────────────────────────
exports.deleteTeam = async (req, res) => {
  try {
    const team = await Team.findById(req.params.id);
    if (!team) {
      return res.status(404).json({ message: 'Team not found' });
    }

    team.isDeleted = !team.isDeleted;
    await team.save();

    const action = team.isDeleted ? 'deleted' : 'restored';
    logger.info(`Team ${action}: ${team._id}`);
    res.status(200).json({ message: `Team ${action}`, data: team });
  } catch (err) {
    logger.error(`Delete Team Error: ${err.message}`);
    res.status(500).json({ message: 'Failed to update team', error: err.message });
  }
};
