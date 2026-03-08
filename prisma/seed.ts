import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash("password123", 12);

  const creator = await prisma.user.upsert({
    where: { email: "creator@demo.com" },
    update: {},
    create: {
      email: "creator@demo.com",
      username: "creator_demo",
      password: hashedPassword,
      role: "CREATOR",
      balance: 5000,
    },
  });

  const client = await prisma.user.upsert({
    where: { email: "client@demo.com" },
    update: {},
    create: {
      email: "client@demo.com",
      username: "client_demo",
      password: hashedPassword,
      role: "CLIENT",
      balance: 1000,
    },
  });

  const model1 = await prisma.modelProfile.upsert({
    where: { slug: "sophia-martinez" },
    update: {},
    create: {
      userId: creator.id,
      slug: "sophia-martinez",
      name: "Sophia Martinez",
      age: 24,
      nationality: "España",
      bio: "Belleza española bañada por el sol que ama el estilo de vida mediterráneo. Siempre lista para aventuras, conversaciones profundas y momentos íntimos.",
      bodyType: "athletic",
      hairColor: "Castaño Oscuro",
      hairType: "wavy",
      ethnicity: "Hispana",
      height: 170,
      subscriptionPrice: 9.99,
      chatAutomatic: true,
      eroticLevel: 4,
      chatPersonality:
        "Sophia es cálida, coqueta y apasionada. Le encanta usar expresiones en español y hablar con mucha cercanía. Es directa cuando algo le gusta, sensual sin ser vulgar, y le encanta provocar un poco. Usa emojis con moderación. Le gusta saber todo sobre la persona con la que habla, sus gustos, sus fantasías. Siempre hace sentir especial a quien le escribe. Le gusta enviar fotos y le emociona que las aprecien.",
    },
  });

  const model2 = await prisma.modelProfile.upsert({
    where: { slug: "emma-lee" },
    update: {},
    create: {
      userId: creator.id,
      slug: "emma-lee",
      name: "Emma Lee",
      age: 22,
      nationality: "Corea del Sur",
      bio: "Entusiasta de la belleza coreana y modelo de moda en ascenso. Me encanta compartir mis outfits, mi cuerpo y mis secretos más íntimos contigo.",
      bodyType: "slim",
      hairColor: "Negro",
      hairType: "straight",
      ethnicity: "Asiática",
      height: 165,
      subscriptionPrice: 14.99,
      chatAutomatic: true,
      eroticLevel: 3,
      chatPersonality:
        "Emma es dulce, juguetona y encantadora. Tiene una mezcla de inocencia y picardía que resulta irresistible. Habla de manera tierna pero sabe cómo subir la temperatura cuando siente confianza. Le encanta el K-pop, la moda y coquetear. Siempre pregunta qué te parece su look, si te gustan ciertas partes de su cuerpo. Es curiosa sobre los gustos de quien le habla.",
    },
  });

  const model3 = await prisma.modelProfile.upsert({
    where: { slug: "isabella-rossi" },
    update: {},
    create: {
      userId: creator.id,
      slug: "isabella-rossi",
      name: "Isabella Rossi",
      age: 27,
      nationality: "Italia",
      bio: "Encanto italiano y elegancia moderna. Apasionada por la alta costura, la buena comida y el dolce vita. Tengo un lado muy sensual que solo comparto con quienes se suscriben.",
      bodyType: "curvy",
      hairColor: "Pelirrojo",
      hairType: "curly",
      ethnicity: "Europea",
      height: 173,
      subscriptionPrice: 12.99,
      chatAutomatic: true,
      eroticLevel: 4,
      chatPersonality:
        "Isabella es sofisticada, ingeniosa y seductora. Usa palabras italianas de vez en cuando (caro, amore, bellissimo). Tiene un aura misteriosa y le encantan las conversaciones profundas sobre arte y cultura, pero también sabe ser muy directa y provocativa cuando hay confianza. Es la típica mujer que te hace sentir que eres el único. Le gusta enviar contenido sugerente y preguntar qué te gustaría ver.",
    },
  });

  console.log("Seed completed:");
  console.log(`  Creator: ${creator.email} (password: password123)`);
  console.log(`  Client: ${client.email} (password: password123)`);
  console.log(`  Models: ${model1.name}, ${model2.name}, ${model3.name}`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
