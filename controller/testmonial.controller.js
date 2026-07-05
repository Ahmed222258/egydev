const Testimonial = require('../model/Testimonial.model');
const logger = require('../utils/logger.util');

exports.createTestimonial = async (req, res) => {
  try {
    const { message } = req.body;

    const testimonial = new Testimonial({
      user: req.user.id,
      message,
    });

    await testimonial.save();
    res.status(201).json({ message: 'Testimonial submitted', data: testimonial });
  } catch (error) {
    logger.error(`createTestimonial error: ${error.message}`);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getAcceptedTestimonials = async (req, res) => {
  try {
    const testimonials = await Testimonial.find({ accepted: true }).populate('user', 'name email');
    res.status(200).json({ data: testimonials });
  } catch (error) {
    logger.error(`getAcceptedTestimonials error: ${error.message}`);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getAllTestimonials = async (req, res) => {
  try {
    const testimonials = await Testimonial.find().populate('user', 'name email');
    res.status(200).json({ data: testimonials });
  } catch (error) {
    logger.error(`getAllTestimonials error: ${error.message}`);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.acceptTestimonial = async (req, res) => {
  try {
    const testimonial = await Testimonial.findByIdAndUpdate(
      req.params.id,
      { accepted: true },
      { new: true }
    );
    if (!testimonial) return res.status(404).json({ message: 'Not found' });
    res.status(200).json({ message: 'Testimonial accepted', data: testimonial });
  } catch (error) {
    logger.error(`acceptTestimonial error: ${error.message}`);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
