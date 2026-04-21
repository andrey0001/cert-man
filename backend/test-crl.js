const jsrsasign = require('jsrsasign');
const { X509 } = jsrsasign;

// Dummy CA cert and key
const kp = jsrsasign.KEYUTIL.generateKeypair("RSA", 2048);
const prvKey = kp.prvKeyObj;

const crl = new jsrsasign.KJUR.asn1.x509.CRL({
  issuer: { str: "/C=US/O=Test" },
  expire: { str: "240101000000Z" },
  nextupdate: { str: "250101000000Z" },
  revcert: [
    { sn: { hex: "1234" }, date: { str: "230101000000Z" } }
  ],
  sigalg: "SHA256withRSA",
  signkeyobj: prvKey
});

console.log(crl.getPEMString());
