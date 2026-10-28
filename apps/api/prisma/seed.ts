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

const POST_TEXTS = [
  'Primer café del día, listo para arrancar ☕',
  'Terminé un proyecto que me tenía pensando toda la semana.',
  'Fin de semana de senderismo con el equipo 🏔️',
  '¿Alguien más madrugando para ver el amanecer?',
  'Probando una receta nueva, salió mejor de lo esperado 🍰',
  'Leyendo un libro buenísimo, lo recomiendo.',
  'Día de bicicleta, 20 km y contando.',
  null, // publicación solo con imágenes
  'Reunión de equipo productiva hoy.',
  'Aprendiendo algo nuevo cada día.',
  null,
  'Viaje corto este fin de semana, necesitaba el descanso.',
  'Cocinando para los amigos esta noche 🍲',
  'Partida de ajedrez interesante hoy ♟️',
  'Entrenamiento de hoy: 10 km. Rumbo al próximo maratón.',
  'Nueva publicación para probar la app 👋',
  'Compartiendo mis apuntes de la clase de hoy.',
  null,
  'Domingo tranquilo con un buen té 📚',
  'Nuevo rollo de fotos revelado, me encantan los resultados.',
];

// No hay Cloudinary todavía (S2-01): public_id de relleno, no un archivo real.
function samplePostMedia(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    publicId: `seed/demo-${Math.floor(Math.random() * 500)}`,
    mediaType: 'image',
    width: 1200,
    height: 800,
    position: i,
  }));
}

async function seedPosts(users: User[]) {
  const postIds: string[] = [];

  for (const author of users) {
    const postCount = 1 + Math.floor(Math.random() * 5); // 1 a 5

    for (let i = 0; i < postCount; i++) {
      const content = POST_TEXTS[Math.floor(Math.random() * POST_TEXTS.length)];
      // Si no hay texto, la publicación necesita al menos una imagen (RN03)
      const mediaCount =
        content === null
          ? 1 + Math.floor(Math.random() * 3)
          : Math.floor(Math.random() * 3);
      const daysAgo = Math.floor(Math.random() * 30);

      const post = await prisma.post.create({
        data: {
          authorId: author.id,
          content,
          createdAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000),
          media:
            mediaCount > 0
              ? { createMany: { data: samplePostMedia(mediaCount) } }
              : undefined,
        },
      });
      postIds.push(post.id);
    }
  }

  return postIds;
}

const COMMENT_TEXTS = [
  '¡Qué buena foto!',
  'Totalmente de acuerdo.',
  'Me encantó, gracias por compartir.',
  '¿Dónde fue eso?',
  'Jaja está buenísimo.',
  'Yo también quiero ir.',
  'Felicidades, se nota el esfuerzo.',
  'Guárdame un poco 😄',
  'Qué envidia, se ve increíble.',
  'Gracias por el dato, lo voy a probar.',
];

// Comentarios y likes al azar, sin que un usuario repita like en la misma publicación (RN05).
async function seedCommentsAndLikes(users: User[], postIds: string[]) {
  const comments: { postId: string; authorId: string; content: string }[] = [];
  const likes = new Map<string, { userId: string; postId: string }>();

  for (const postId of postIds) {
    const commentCount = Math.floor(Math.random() * 4); // 0 a 3
    for (let i = 0; i < commentCount; i++) {
      const author = users[Math.floor(Math.random() * users.length)];
      comments.push({
        postId,
        authorId: author.id,
        content:
          COMMENT_TEXTS[Math.floor(Math.random() * COMMENT_TEXTS.length)],
      });
    }

    const likeCount = Math.floor(Math.random() * Math.min(users.length, 12));
    const likers = [...users]
      .sort(() => Math.random() - 0.5)
      .slice(0, likeCount);
    for (const liker of likers) {
      likes.set(`${liker.id}:${postId}`, { userId: liker.id, postId });
    }
  }

  await prisma.comment.createMany({ data: comments });
  await prisma.postLike.createMany({
    data: [...likes.values()],
    skipDuplicates: true,
  });
}

// like_count y comment_count están desnormalizados (D05): se recalculan desde los datos
// que acabamos de insertar, para que queden coherentes de verdad y no solo "a ojo".
async function recomputePostCounters() {
  const posts = await prisma.post.findMany({
    select: { id: true, _count: { select: { likes: true, comments: true } } },
  });

  for (const post of posts) {
    await prisma.post.update({
      where: { id: post.id },
      data: {
        likeCount: post._count.likes,
        commentCount: post._count.comments,
      },
    });
  }
}

async function main() {
  // Los usuarios y seguimientos son seguros de repetir (upsert y skipDuplicates).
  // Las publicaciones, comentarios y likes no: cada corrida agrega más, a propósito,
  // para tener siempre datos frescos. Para partir de cero, usa `prisma migrate reset`.
  const users = await seedUsers();
  await seedFollows(users);
  const postIds = await seedPosts(users);
  await seedCommentsAndLikes(users, postIds);
  await recomputePostCounters();

  console.log(
    `${users.length} usuarios listos. Se agregaron ${postIds.length} publicaciones nuevas con sus comentarios y likes.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
