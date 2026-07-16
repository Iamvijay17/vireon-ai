const path = require('path');

module.exports = {
  // The directory where the Remotion project is located
  projectRoot: path.join(__dirname, 'remotion'),
  // The directory where video and image files are stored
  assets: {
    public: path.join(__dirname, 'jobs'),
  },
};