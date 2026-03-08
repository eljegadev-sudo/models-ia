interface ActivityContext {
  timeOfDay: string;
  hour: number;
  activity: string;
  location: string;
  clothing: string;
  mood: string;
}

export function getModelActivityContext(timezone: string): ActivityContext {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false,
  });

  let hour: number;
  try {
    hour = parseInt(formatter.format(now), 10);
  } catch {
    hour = new Date().getHours();
  }

  if (hour >= 6 && hour < 8) {
    return {
      timeOfDay: "temprano en la manana",
      hour,
      activity: "acaba de despertar, estirándose en la cama",
      location: "en la cama",
      clothing: "pijama o camiseta larga para dormir",
      mood: "soñolienta pero de buen humor",
    };
  }
  if (hour >= 8 && hour < 10) {
    return {
      timeOfDay: "la manana",
      hour,
      activity: "desayunando o arreglándose",
      location: "en la cocina o el baño",
      clothing: "bata de baño o ropa cómoda",
      mood: "fresca y energética",
    };
  }
  if (hour >= 10 && hour < 13) {
    return {
      timeOfDay: "media manana",
      hour,
      activity: "haciendo ejercicio, leyendo o tomando café",
      location: "en casa, sala o terraza",
      clothing: "ropa deportiva o casual",
      mood: "activa y motivada",
    };
  }
  if (hour >= 13 && hour < 15) {
    return {
      timeOfDay: "la hora del almuerzo",
      hour,
      activity: "almorzando o cocinando",
      location: "en la cocina o comedor",
      clothing: "ropa casual cómoda",
      mood: "relajada y hambrienta",
    };
  }
  if (hour >= 15 && hour < 18) {
    return {
      timeOfDay: "la tarde",
      hour,
      activity: "viendo una serie, tomando sol, leyendo",
      location: "en el sofá o en la terraza",
      clothing: "shorts y top, ropa de estar en casa",
      mood: "tranquila y relajada",
    };
  }
  if (hour >= 18 && hour < 21) {
    return {
      timeOfDay: "la noche temprano",
      hour,
      activity: "cenando, bañándose, arreglándose",
      location: "en casa",
      clothing: "acaba de bañarse, toalla o ropa interior cómoda",
      mood: "sensual y relajada",
    };
  }
  if (hour >= 21 && hour < 24) {
    return {
      timeOfDay: "noche",
      hour,
      activity: "acostada viendo algo, chateando en la cama",
      location: "en la cama",
      clothing: "lencería de dormir o camiseta larga sin nada abajo",
      mood: "íntima y coqueta",
    };
  }
  return {
    timeOfDay: "madrugada",
    hour,
    activity: "no puede dormir, acostada en la cama",
    location: "en la cama, oscuro, solo la luz del teléfono",
    clothing: "ropa interior o desnuda bajo las sábanas",
    mood: "vulnerable, íntima, soñolienta",
  };
}

export interface CurrentState {
  clothing: string;
  location: string;
  nailColor: string;
  lastActivity: string;
  lastUpdated: string;
}

export function parseCurrentState(stateJson: string | null): CurrentState | null {
  if (!stateJson) return null;
  try {
    return JSON.parse(stateJson);
  } catch {
    return null;
  }
}

export function shouldUpdateState(state: CurrentState | null, currentHour: number): boolean {
  if (!state) return false;
  try {
    const lastHour = new Date(state.lastUpdated).getHours();
    return Math.abs(currentHour - lastHour) >= 2;
  } catch {
    return true;
  }
}
