const chalk = require('chalk');

const LOG_LEVELS = {
  error: { label: 'ERROR', color: chalk.bold.redBright, badge: '❌' },
  warn: { label: 'WARN', color: chalk.bold.hex('#FFA500'), badge: '⚠️' },
  info: { label: 'INFO', color: chalk.bold.cyanBright, badge: 'ℹ️' },
  success: { label: 'OK', color: chalk.bold.greenBright, badge: '✅' },
  debug: { label: 'DEBUG', color: chalk.bold.magentaBright, badge: '🔍' },
  http: { label: 'HTTP', color: chalk.bold.blueBright, badge: '🌐' },
  event: { label: 'EVENT', color: chalk.bold.yellowBright, badge: '📢' },
};

const timestamp = () => {
  const now = new Date();
  return chalk.dim.italic(
    `${now.toLocaleDateString('en-GB')} ${now.toLocaleTimeString('en-GB', { hour12: false })}`
  );
};

const divider = chalk.dim('│');

function log(level, message, data = null) {
  const { label, color, badge } = LOG_LEVELS[level] || LOG_LEVELS.info;
  const prefix = `${badge} ${color(label)}`;

  console.log(`${timestamp()} ${divider} ${prefix} ${divider} ${color(message)}`);

  if (data !== null) {
    const formattedData = typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
    console.log(`${' '.repeat(30)} ${chalk.dim('└─')} ${chalk.italic.hex('#a0a0a0')(formattedData)}`);
  }
}

function border(message, level = 'info') {
  const { color, badge } = LOG_LEVELS[level] || LOG_LEVELS.info;
  const line = '═'.repeat(Math.min(message.length + 6, 60));
  console.log(`\n${chalk.dim('╔' + line + '╗')}`);
  console.log(`${chalk.dim('║')}   ${badge} ${color.bold(message)}   ${chalk.dim('║')}`);
  console.log(`${chalk.dim('╚' + line + '╝')}\n`);
}

function serverStart(port) {
  border('🚀 SERVER STARTING', 'event');
  console.log(`  ${chalk.green('➜')}  ${chalk.bold('Local:')}    ${chalk.underline.cyan(`http://localhost:${port}`)}`);
  console.log(`  ${chalk.green('➜')}  ${chalk.bold('Health:')}  ${chalk.underline.cyan(`http://localhost:${port}/health`)}`);
  console.log(`  ${chalk.green('➜')}  ${chalk.bold('Time:')}    ${chalk.white(new Date().toISOString())}`);
  console.log(`  ${chalk.green('➜')}  ${chalk.bold('PID:')}     ${chalk.white(process.pid)}`);
  console.log();
}

module.exports = {
  error: (msg, data) => log('error', msg, data),
  warn: (msg, data) => log('warn', msg, data),
  info: (msg, data) => log('info', msg, data),
  success: (msg, data) => log('success', msg, data),
  debug: (msg, data) => log('debug', msg, data),
  http: (msg, data) => log('http', msg, data),
  event: (msg, data) => log('event', msg, data),
  border,
  serverStart,
};
