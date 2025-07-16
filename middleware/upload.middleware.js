const multer = require('multer');
const path = require('path');

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowed = ['.jpg', '.jpeg', '.png'];
  if (!allowed.includes(ext)) {
    return cb(new Error('Only image files are allowed (.jpg, .jpeg, .png)'));
  }
  cb(null, true);
};

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads'); 
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + '-' + file.originalname;
    cb(null, uniqueName);
  }
});

const MB = 1024 * 1024*10;

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * MB }  
});

module.exports = { upload, storage };
