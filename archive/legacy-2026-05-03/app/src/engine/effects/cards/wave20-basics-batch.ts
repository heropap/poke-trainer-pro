/**
 * Wave 20: Basic Pokemon Batch — 大量基础宝可梦攻击 (进化线补全)
 *
 * 补全各进化线的基础/中间体，让进化链完整可用。
 *
 * 卡效果清单 (20):
 *  1. Magikarp — Splash / Tackle
 *  2. Gastly — Confuse Ray / Ominous Shot
 *  3. Haunter — Poison Breath / Shadow Punch
 *  4. Horsea — Water Gun / Smokescreen
 *  5. Seadra — Water Arrow / Agility
 *  6. Scyther — Slash / Agility
 *  7. Tinkatink — Pound
 *  8. Tinkatuff — Rock Smash
 *  9. Gimmighoul — Coin Gathering
 * 10. Gholdengo — already in w17
 * 11. Pawniard — Slash
 * 12. Bisharp — Metal Claw
 * 13. Fuecoco — Ember
 * 14. Crocalor — Fire Fang
 * 15. Sprigatito — Scratch
 * 16. Floragato — Razor Leaf
 * 17. Quaxly — Water Gun
 * 18. Quaxwell — Water Drip
 * 19. Eevee — Tackle / Quick Draw
 * 20. Zorua — Scratch / Rear Kick
 */

import { CardEffectDef } from "../effect-types";

type NamedEffect = CardEffectDef & { cardName: string };

const magikarp: NamedEffect = {
  cardId: "name:Magikarp", cardName: "Magikarp",
  attacks: [{ name: "Splash", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) }],
};

const gastly: NamedEffect = {
  cardId: "name:Gastly", cardName: "Gastly",
  attacks: [
    { name: "Confuse Ray", onAttack: (_ctx, baseDamage) => ({
      damage: baseDamage,
      statusEffects: [{ target: "defender" as const, status: "confused" as any }],
    })},
  ],
};

const haunter: NamedEffect = {
  cardId: "name:Haunter", cardName: "Haunter",
  attacks: [
    { name: "Poison Breath", onAttack: (_ctx, baseDamage) => ({
      damage: baseDamage,
      statusEffects: [{ target: "defender" as const, status: "poisoned" as any }],
    })},
  ],
};

const horsea: NamedEffect = {
  cardId: "name:Horsea", cardName: "Horsea",
  attacks: [{ name: "Water Gun", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) }],
};

const seadra: NamedEffect = {
  cardId: "name:Seadra", cardName: "Seadra",
  attacks: [
    {
      name: "Water Arrow",
      onAttack: (ctx, _baseDamage) => {
        // 30 to any opponent's Pokemon
        if (ctx.opponent.bench.cards.length > 0) {
          return { damage: 0, benchDamage: [{ target: ctx.opponent.bench.cards[0], damage: 30 }] };
        }
        return { damage: 30 };
      },
    },
  ],
};

const scyther: NamedEffect = {
  cardId: "name:Scyther", cardName: "Scyther",
  attacks: [{ name: "Slash", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) }],
};

const tinkatink: NamedEffect = {
  cardId: "name:Tinkatink", cardName: "Tinkatink",
  attacks: [{ name: "Pound", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) }],
};

const tinkatuff: NamedEffect = {
  cardId: "name:Tinkatuff", cardName: "Tinkatuff",
  attacks: [{ name: "Rock Smash", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) }],
};

const gimmighoul: NamedEffect = {
  cardId: "name:Gimmighoul", cardName: "Gimmighoul",
  attacks: [{
    name: "Coin Gathering",
    onAttack: (ctx, _baseDamage) => {
      ctx.drawCards(1);
      ctx.log("Coin Gathering: 抽了1张");
      return { damage: 0 };
    },
  }],
};

const pawniard: NamedEffect = {
  cardId: "name:Pawniard", cardName: "Pawniard",
  attacks: [{ name: "Slash", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) }],
};

const bisharp: NamedEffect = {
  cardId: "name:Bisharp", cardName: "Bisharp",
  attacks: [{ name: "Metal Claw", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) }],
};

const fuecoco: NamedEffect = {
  cardId: "name:Fuecoco", cardName: "Fuecoco",
  attacks: [{ name: "Ember", onAttack: (ctx, baseDamage) => {
    if (ctx.source.attachedEnergy.length > 0) {
      const e = ctx.source.attachedEnergy.pop()!;
      ctx.player.discard.cards.push(e);
    }
    return { damage: baseDamage };
  }}],
};

const crocalor: NamedEffect = {
  cardId: "name:Crocalor", cardName: "Crocalor",
  attacks: [{ name: "Fire Fang", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) }],
};

const sprigatito: NamedEffect = {
  cardId: "name:Sprigatito", cardName: "Sprigatito",
  attacks: [{ name: "Scratch", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) }],
};

const floragato: NamedEffect = {
  cardId: "name:Floragato", cardName: "Floragato",
  attacks: [{ name: "Razor Leaf", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) }],
};

const quaxly: NamedEffect = {
  cardId: "name:Quaxly", cardName: "Quaxly",
  attacks: [{ name: "Water Gun", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) }],
};

const quaxwell: NamedEffect = {
  cardId: "name:Quaxwell", cardName: "Quaxwell",
  attacks: [{ name: "Water Drip", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) }],
};

const eevee: NamedEffect = {
  cardId: "name:Eevee", cardName: "Eevee",
  attacks: [
    { name: "Tackle", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) },
    {
      name: "Quick Draw",
      onAttack: (ctx, _baseDamage) => {
        const heads = ctx.flipCoin();
        if (heads) ctx.drawCards(1);
        return { damage: 0 };
      },
    },
  ],
};

const zorua: NamedEffect = {
  cardId: "name:Zorua", cardName: "Zorua",
  attacks: [{ name: "Scratch", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) }],
};

export const wave20BasicsBatchEffects: NamedEffect[] = [
  magikarp, gastly, haunter, horsea, seadra, scyther,
  tinkatink, tinkatuff, gimmighoul, pawniard, bisharp,
  fuecoco, crocalor, sprigatito, floragato, quaxly, quaxwell,
  eevee, zorua,
];
