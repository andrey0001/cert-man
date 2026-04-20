import * as forge from 'node-forge';
import * as fs from 'fs';
import * as path from 'path';

export interface CertConfig {
  commonName: string;
  emailAddress?: string;
  organization?: string;
  organizationalUnit?: string;
  country?: string;
  state?: string;
  locality?: string;
  validityDays: number;
  keySize: 2048 | 4096;
  sans?: string[];
  isClient?: boolean;
}

function generateSerial() {
  return forge.util.bytesToHex(forge.random.getBytesSync(16));
}

function getSubjectAttributes(config: CertConfig) {
  const attrs: forge.pki.CertificateField[] = [
    { name: 'commonName', value: config.commonName }
  ];
  if (config.country) attrs.push({ name: 'countryName', value: config.country });
  if (config.organization) attrs.push({ name: 'organizationName', value: config.organization });
  if (config.emailAddress) attrs.push({ name: 'emailAddress', value: config.emailAddress });
  if (config.organizationalUnit) attrs.push({ name: 'organizationalUnitName', value: config.organizationalUnit });
  if (config.state) attrs.push({ name: 'stateOrProvinceName', value: config.state });
  if (config.locality) attrs.push({ name: 'localityName', value: config.locality });
  return attrs;
}

export function generateCA(config: CertConfig) {
  const keys = forge.pki.rsa.generateKeyPair(config.keySize);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = generateSerial();
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setTime(cert.validity.notBefore.getTime() + config.validityDays * 24 * 60 * 60 * 1000);

  const attrs = getSubjectAttributes(config);

  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, digitalSignature: true, nonRepudiation: true, keyEncipherment: true, dataEncipherment: true },
    { name: 'subjectKeyIdentifier' }
  ]);

  cert.sign(keys.privateKey, forge.md.sha256.create());

  return {
    certPem: forge.pki.certificateToPem(cert),
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
    serial: cert.serialNumber
  };
}

export function generateIntermediateCA(caCertPem: string, caKeyPem: string, config: CertConfig) {
  const caCert = forge.pki.certificateFromPem(caCertPem);
  const caKey = forge.pki.privateKeyFromPem(caKeyPem);
  const keys = forge.pki.rsa.generateKeyPair(config.keySize);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = generateSerial();
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setTime(cert.validity.notBefore.getTime() + config.validityDays * 24 * 60 * 60 * 1000);

  const subjectAttrs = getSubjectAttributes(config);

  cert.setSubject(subjectAttrs);
  cert.setIssuer(caCert.subject.attributes);

  cert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true, digitalSignature: true, nonRepudiation: true, keyEncipherment: true, dataEncipherment: true },
    { name: 'subjectKeyIdentifier' },
    {
      name: 'authorityKeyIdentifier',
      keyIdentifier: (caCert as any).generateSubjectKeyIdentifier().getBytes()
    }
  ]);

  cert.sign(caKey, forge.md.sha256.create());

  return {
    certPem: forge.pki.certificateToPem(cert),
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
    serial: cert.serialNumber
  };
}

export function generateCert(caCertPem: string, caKeyPem: string, config: CertConfig) {
  const caCert = forge.pki.certificateFromPem(caCertPem);
  const caKey = forge.pki.privateKeyFromPem(caKeyPem);
  const keys = forge.pki.rsa.generateKeyPair(config.keySize);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = generateSerial();
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setTime(cert.validity.notBefore.getTime() + config.validityDays * 24 * 60 * 60 * 1000);

  const subjectAttrs = getSubjectAttributes(config);

  cert.setSubject(subjectAttrs);
  cert.setIssuer(caCert.subject.attributes);

  const extensions: any[] = [
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    {
      name: 'extKeyUsage',
      serverAuth: !config.isClient,
      clientAuth: config.isClient
    },
    { name: 'subjectKeyIdentifier' },
    {
      name: 'authorityKeyIdentifier',
      keyIdentifier: (caCert as any).generateSubjectKeyIdentifier().getBytes()
    }
  ];

  if (config.sans && config.sans.length > 0) {
    extensions.push({
      name: 'subjectAltName',
      altNames: config.sans.map(name => {
        const isIp = /^[0-9.]+$/.test(name) || name.includes(':');
        const isEmail = name.includes('@');
        if (isIp) {
          return { type: 7, ip: name };
        } else if (isEmail) {
          return { type: 1, value: name };
        }
        return { type: 2, value: name };
      })
    });
  }

  cert.setExtensions(extensions);
  cert.sign(caKey, forge.md.sha256.create());

  return {
    certPem: forge.pki.certificateToPem(cert),
    privateKeyPem: forge.pki.privateKeyToPem(keys.privateKey),
    serial: cert.serialNumber
  };
}

export function exportToPkcs12(certPem: string, keyPem: string, caCertPem: string, password: string) {
  const cert = forge.pki.certificateFromPem(certPem);
  const key = forge.pki.privateKeyFromPem(keyPem);
  const caCert = forge.pki.certificateFromPem(caCertPem);

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(key, [cert, caCert], password, { algorithm: 'aes256' });
  const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
  return Buffer.from(p12Der, 'binary');
}