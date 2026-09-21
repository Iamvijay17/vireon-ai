const { compile, formatIssues, FPS } = require('./compile');
const { toRenderProps, diffRenderProps } = require('./toRenderProps');
const schema = require('./schema');
const templateRegistry = require('./templateRegistry');

module.exports = {
  compile,
  formatIssues,
  toRenderProps,
  diffRenderProps,
  FPS,
  ...schema,
  ...templateRegistry,
};
