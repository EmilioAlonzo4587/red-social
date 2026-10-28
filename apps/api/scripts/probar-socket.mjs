// Prueba el socket autenticado contra una api desplegada (S1-04), pasando por Caddy.
// Inicia sesión con una cuenta de prueba, se conecta con su cookie y revisa tres casos:
// con sesión llega session:ready, sin cookie se rechaza y con otro Origin también.
//
// Uso, desde la raíz del repo (la contraseña se escribe sin que se vea y no queda en el historial):
//   read -rsp "Contraseña: " SOCKET_TEST_PASSWORD; echo; export SOCKET_TEST_PASSWORD
//   SOCKET_TEST_USER=usuario node apps/api/scripts/probar-socket.mjs https://tu-dominio
import { io } from 'socket.io-client';

const baseUrl = process.argv[2];
const identifier = process.env.SOCKET_TEST_USER;
const password = process.env.SOCKET_TEST_PASSWORD;
if (!baseUrl || !identifier || !password) {
  console.error(
    'Uso: SOCKET_TEST_USER=... SOCKET_TEST_PASSWORD=... node apps/api/scripts/probar-socket.mjs https://dominio',
  );
  process.exit(1);
}

// 1. Login: la api responde con Set-Cookie; de ahí se toma access_token
const res = await fetch(`${baseUrl}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ identifier, password }),
});
if (!res.ok) {
  console.error(`Login falló: ${res.status}`);
  process.exit(1);
}
const access = res.headers
  .getSetCookie()
  .map((line) => line.split(';')[0])
  .find((pair) => pair.startsWith('access_token='));

// Conecta y espera session:ready o connect_error, lo que llegue primero (máximo 10 s)
function tryConnect(headers) {
  return new Promise((resolve) => {
    const socket = io(baseUrl, {
      extraHeaders: headers,
      reconnection: false,
      forceNew: true,
    });
    const done = (result) => {
      socket.disconnect();
      resolve(result);
    };
    socket.once('session:ready', (data) =>
      done(`session:ready ${JSON.stringify(data)}`),
    );
    socket.once('connect_error', (error) =>
      done(`connect_error ${error.message}`),
    );
    setTimeout(() => done('sin respuesta en 10 s'), 10_000);
  });
}

const cases = [
  ['Con sesión', { Cookie: access }, /^session:ready/],
  ['Sin cookie', {}, /^connect_error unauthorized$/],
  [
    'Otro Origin',
    { Cookie: access, Origin: 'https://sitio-ajeno.example' },
    /^connect_error forbidden$/,
  ],
];

let failed = false;
for (const [name, headers, expected] of cases) {
  const result = await tryConnect(headers);
  const ok = expected.test(result);
  failed ||= !ok;
  console.log(`${ok ? 'OK   ' : 'FALLA'} ${name}: ${result}`);
}
process.exit(failed ? 1 : 0);
