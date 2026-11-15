/** Battle-rule fixtures explicitly enter the hostile tier; shipped new games remain peaceful. */
export function atWar(world) {
  for (const relation of world.diplomacy.relations) relation.value = -150;
  return world;
}
