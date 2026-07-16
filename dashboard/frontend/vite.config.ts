import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Dynamically load SSL certs if available for HTTPS
let httpsConfig: any = false;
try {
  const certDir = path.resolve(__dirname, '../../certs');
  const keyPath = process.env.SSL_KEY_FILE || path.join(certDir, 'server.key');
  const certPath = process.env.SSL_CERT_FILE || path.join(certDir, 'server.crt');
  
  // Also check root path /certs for container runtime compatibility
  const containerKey = '/certs/server.key';
  const containerCert = '/certs/server.crt';

  if (fs.existsSync(containerKey) && fs.existsSync(containerCert)) {
    httpsConfig = {
      key: fs.readFileSync(containerKey),
      cert: fs.readFileSync(containerCert),
    };
    console.log("Vite loading container SSL certificates.");
  } else if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    httpsConfig = {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
    console.log("Vite loading local relative SSL certificates.");
  } else {
    console.log("Vite starting in HTTP mode (certificates not found).");
  }
} catch (e) {
  console.warn("Could not load SSL certs for Vite, starting on HTTP:", e);
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    https: httpsConfig,
  }
})
