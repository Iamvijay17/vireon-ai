// Split into socketService/{state,connection,redisBridge,coreEmit,
// jobEvents,courseEvents}.js for maintainability - see socketService/index.js
// for how the pieces compose.
// NOTE: requires the explicit /index path - 'socketService' collides
// case-insensitively with this file's own name (SocketService.js) on
// Windows, which otherwise resolves back to this file instead of the
// subfolder and silently yields an empty object.
module.exports = require('./socketService/index');
