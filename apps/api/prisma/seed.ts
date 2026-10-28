import { PrismaClient, type User } from '@prisma/client';
import { hash } from '@node-rs/argon2';

const prisma = new PrismaClient();

// Misma contraseña para las 20 cuentas de demostración: así cualquiera del equipo
// puede iniciar sesión con cualquier usuario sembrado para probar la app.
const DEMO_PASSWORD = 'demo12345';

const USERS = [
  {
    username: 'ana_lopez',
    displayName: 'Ana López',
    bio: 'Fotografía y café por las mañanas ☕',
  },
  {
    username: 'carlos_mendez',
    displayName: 'Carlos Méndez',
    bio: 'Ingeniero de software. Ciclista de fin de semana.',
  },
  {
    username: 'luisa_ramirez',
    displayName: 'Luisa Ramírez',
    bio: 'Me gusta la fotografía y las caminatas.',
  },
  { username: 'diego_torres', displayName: 'Diego Torres', bio: null },
  {
    username: 'maria_fernandez',
    displayName: 'María Fernández',
    bio: 'Diseñadora UX. Amante de los gatos 🐱',
  },
  {
    username: 'jorge_castillo',
    displayName: 'Jorge Castillo',
    bio: 'Estudiante de ingeniería.',
  },
  {
    username: 'sofia_morales',
    displayName: 'Sofía Morales',
    bio: 'Viajando por Centroamérica ✈️',
  },
  { username: 'andres_pineda', displayName: 'Andrés Pineda', bio: null },
  {
    username: 'valentina_cruz',
    displayName: 'Valentina Cruz',
    bio: 'Músico de fin de semana, dev entre semana.',
  },
  {
    username: 'pablo_herrera',
    displayName: 'Pablo Herrera',
    bio: 'Café, código y senderismo.',
  },
  {
    username: 'camila_reyes',
    displayName: 'Camila Reyes',
    bio: 'Apasionada por la cocina y la repostería 🍰',
  },
  { username: 'fernando_soto', displayName: 'Fernando Soto', bio: null },
  {
    username: 'daniela_vargas',
    displayName: 'Daniela Vargas',
    bio: 'Estudiante de diseño gráfico.',
  },
  {
    username: 'ricardo_aguilar',
    displayName: 'Ricardo Aguilar',
    bio: 'Entusiasta del ajedrez ♟️',
  },
  {
    username: 'paula_jimenez',
    displayName: 'Paula Jiménez',
    bio: 'Corredora de fondo. 5 maratones y contando.',
  },
  { username: 'esteban_rivas', displayName: 'Esteban Rivas', bio: null },
  {
    username: 'gabriela_ortiz',
    displayName: 'Gabriela Ortiz',
    bio: 'Amante de los libros y el té 📚',
  },
  {
    username: 'mauricio_chavez',
    displayName: 'Mauricio Chávez',
    bio: 'Fotógrafo aficionado.',
  },
  {
    username: 'natalia_duarte',
    displayName: 'Natalia Duarte',
    bio: 'Voluntaria y amante de los animales 🐾',
  },
  { username: 'oscar_molina', displayName: 'Óscar Molina', bio: null },
] as const;

async function seedUsers() {
  const passwordHash = await hash(DEMO_PASSWORD);

  const users: User[] = [];
  for (const u of USERS) {
    const user = await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: {
        username: u.username,
        email: `${u.username}@chatinit.example.com`,
        passwordHash,
        displayName: u.displayName,
        bio: u.bio,
      },
    });
    users.push(user);
  }
  return users;
}

// Cada usuario sigue entre 3 y 8 personas al azar, nunca a sí mismo (RN06).
async function seedFollows(users: { id: string }[]) {
  const follows: { followerId: string; followingId: string }[] = [];

  for (const follower of users) {
    const candidates = users.filter((u) => u.id !== follower.id);
    const count = 3 + Math.floor(Math.random() * 6); // 3 a 8
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    for (const following of shuffled.slice(0, count)) {
      follows.push({ followerId: follower.id, followingId: following.id });
    }
  }

  await prisma.follow.createMany({ data: follows, skipDuplicates: true });
}

async function main() {
  const users = await seedUsers();
  await seedFollows(users);

  console.log(`${users.length} usuarios y sus seguimientos listos.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
