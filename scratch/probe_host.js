/* 临时探针：查线上站点的 HTTP 响应头 + TLS 证书（回答「部署在哪」） */
'use strict';
const https = require('https');
const tls = require('tls');

const HOST = 'qggpmfqcjeedw.space.mcode.cn';

https.get('https://' + HOST + '/', res => {
  console.log('=== HTTP 响应头 ===');
  Object.keys(res.headers).forEach(k => console.log('  ' + k + ': ' + res.headers[k]));
  res.resume();
}).on('error', e => console.log('HTTP 错误：' + e.message));

setTimeout(() => {
  const sock = tls.connect({ host: HOST, port: 443, servername: HOST }, () => {
    const cert = sock.getPeerCertificate();
    console.log('\n=== TLS 证书 ===');
    console.log('  subject :', JSON.stringify(cert.subject));
    console.log('  issuer  :', JSON.stringify(cert.issuer));
    console.log('  valid   :', cert.valid_from, '→', cert.valid_to);
    console.log('  altName :', (cert.subject_alt_name || '').split(',').join(', '));
    sock.end();
  });
  sock.on('error', e => console.log('TLS 错误：' + e.message));
}, 400);
