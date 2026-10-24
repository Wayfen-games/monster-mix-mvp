// Node에서 게임 규칙을 불러오는 도우미
const path = require('path');
const js = p => path.join(__dirname, '..', 'js', p);
['balance.js', 'data.js', 'logic.js'].forEach(f => require(js(f)));
module.exports = globalThis.MM;
