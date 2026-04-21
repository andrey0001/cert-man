import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = process.env.DATA_DIR || './data';

export interface CertMetadata {
  serial: string;
  commonName: string;
  type: 'ca' | 'server' | 'client';
  caSerial?: string;
  issuedAt: string;
  expiresAt: string;
  status: 'active' | 'revoked';
  revokedAt?: string;
  [key: string]: any;
}

export function initStorage() {
  const dirs = ['ca', 'certs', 'keys', 'crl', 'export'];
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  dirs.forEach(dir => {
    const p = path.join(DATA_DIR, dir);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p);
    }
  });

  const indexPath = path.join(DATA_DIR, 'index.json');
  if (!fs.existsSync(indexPath)) {
    fs.writeFileSync(indexPath, JSON.stringify([], null, 2));
  }
}

export function getIndex(): CertMetadata[] {
  const indexPath = path.join(DATA_DIR, 'index.json');
  return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
}

export function saveToIndex(meta: CertMetadata) {
  const index = getIndex();
  index.push(meta);
  fs.writeFileSync(path.join(DATA_DIR, 'index.json'), JSON.stringify(index, null, 2));
}

export function updateInIndex(serial: string, updates: Partial<CertMetadata>) {
  const index = getIndex();
  const i = index.findIndex(m => m.serial === serial);
  if (i !== -1) {
    index[i] = { ...index[i], ...updates };
    fs.writeFileSync(path.join(DATA_DIR, 'index.json'), JSON.stringify(index, null, 2));
  }
}

export function deleteFromIndex(serial: string) {
  const index = getIndex();
  const newIndex = index.filter(m => m.serial !== serial);
  fs.writeFileSync(path.join(DATA_DIR, 'index.json'), JSON.stringify(newIndex, null, 2));
}

export function saveFile(subDir: string, fileName: string, content: string | Buffer) {
  fs.writeFileSync(path.join(DATA_DIR, subDir, fileName), content);
}

export function deleteFile(subDir: string, fileName: string) {
  const p = path.join(DATA_DIR, subDir, fileName);
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
  }
}

export function readFile(subDir: string, fileName: string) {
  return fs.readFileSync(path.join(DATA_DIR, subDir, fileName), 'utf8');
}

export function readFileBuffer(subDir: string, fileName: string) {
  return fs.readFileSync(path.join(DATA_DIR, subDir, fileName));
}
