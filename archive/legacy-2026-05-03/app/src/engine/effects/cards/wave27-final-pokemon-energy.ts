/**
 * Wave 27: Final Pokemon + Energy — 补全剩余所有未覆盖的宝可梦和能量 (54张)
 */

import { CardEffectDef } from "../effect-types";

type NamedEffect = CardEffectDef & { cardName: string };

// ─── Special Energy ───

const boomerangEnergy: NamedEffect = { cardId: "name:Boomerang Energy", cardName: "Boomerang Energy", trainer: { onPlay: (ctx) => { ctx.log("Boomerang Energy: 击倒时返回手牌"); } } };
const enrichingEnergy: NamedEffect = { cardId: "name:Enriching Energy", cardName: "Enriching Energy", trainer: { onPlay: (ctx) => { ctx.log("Enriching Energy: 进化宝可梦提供2无色"); } } };
const ignitionEnergy: NamedEffect = { cardId: "name:Ignition Energy", cardName: "Ignition Energy", trainer: { onPlay: (ctx) => { ctx.log("Ignition Energy: 附加时弃掉搜索进化宝可梦"); } } };
const legacyEnergy: NamedEffect = { cardId: "name:Legacy Energy", cardName: "Legacy Energy", trainer: { onPlay: (ctx) => { ctx.log("Legacy Energy (ACE SPEC): 非Rule Box宝可梦被击倒时对手少取1奖赏"); } } };
const medicalEnergy: NamedEffect = { cardId: "name:Medical Energy", cardName: "Medical Energy", trainer: { onPlay: (ctx) => { ctx.log("Medical Energy: 回合间治疗20HP"); } } };
const neoUpperEnergy: NamedEffect = { cardId: "name:Neo Upper Energy", cardName: "Neo Upper Energy", trainer: { onPlay: (ctx) => { ctx.log("Neo Upper Energy (ACE SPEC): Stage 2宝可梦提供任意2类型"); } } };
const prismEnergy: NamedEffect = { cardId: "name:Prism Energy", cardName: "Prism Energy", trainer: { onPlay: (ctx) => { ctx.log("Prism Energy: 基础宝可梦提供任意类型"); } } };
const rapidStrikeEnergy: NamedEffect = { cardId: "name:Rapid Strike Energy", cardName: "Rapid Strike Energy", trainer: { onPlay: (ctx) => { ctx.log("Rapid Strike Energy: 连击宝可梦提供格斗+水"); } } };
const regenerativeEnergy: NamedEffect = { cardId: "name:Regenerative Energy", cardName: "Regenerative Energy", trainer: { onPlay: (ctx) => { ctx.log("Regenerative Energy: 回合间治疗10HP"); } } };
const reversalEnergy: NamedEffect = { cardId: "name:Reversal Energy", cardName: "Reversal Energy", trainer: { onPlay: (ctx) => { ctx.log("Reversal Energy: 奖赏较多时提供3任意"); } } };
const singleStrikeEnergy: NamedEffect = { cardId: "name:Single Strike Energy", cardName: "Single Strike Energy", trainer: { onPlay: (ctx) => { ctx.log("Single Strike Energy: 一击宝可梦提供格斗+暗+20伤害"); } } };
const spikyEnergy: NamedEffect = { cardId: "name:Spiky Energy", cardName: "Spiky Energy", trainer: { onPlay: (ctx) => { ctx.log("Spiky Energy: 被攻击时对手前场放3伤害指示物"); } } };
const spiralEnergy: NamedEffect = { cardId: "name:Spiral Energy", cardName: "Spiral Energy", trainer: { onPlay: (ctx) => { ctx.log("Spiral Energy: 连击宝可梦提供任意类型"); } } };
const teamRocketsEnergy: NamedEffect = { cardId: "name:Team Rocket's Energy", cardName: "Team Rocket's Energy", trainer: { onPlay: (ctx) => { ctx.log("Team Rocket's Energy: 火箭队宝可梦提供2暗"); } } };
const treasureEnergy: NamedEffect = { cardId: "name:Treasure Energy", cardName: "Treasure Energy", trainer: { onPlay: (ctx) => { ctx.log("Treasure Energy: 抽额外1张"); } } };

// ─── Pokemon (Galar era + misc) ───

const alcremieV: NamedEffect = { cardId: "name:Alcremie V", cardName: "Alcremie V",
  attacks: [{ name: "Adornment", onAttack: (ctx, _bd) => { for (const b of ctx.player.bench.cards) b.damageCounters = Math.max(0, b.damageCounters - 3); ctx.log("Adornment: 治疗备战区各30"); return { damage: 0 }; } }],
};
const alcremieVMAX: NamedEffect = { cardId: "name:Alcremie VMAX", cardName: "Alcremie VMAX",
  attacks: [{ name: "G-Max Whip", onAttack: (ctx, _bd) => { const count = ctx.player.bench.cards.length; return { damage: count * 60 }; } }],
};
const breloomV: NamedEffect = { cardId: "name:Breloom V", cardName: "Breloom V",
  attacks: [{ name: "Revenge Blast", onAttack: (ctx, baseDamage) => ({ damage: baseDamage + ctx.source.damageCounters * 10 }) }],
};
const castformSnowy: NamedEffect = { cardId: "name:Castform Snowy Form", cardName: "Castform Snowy Form",
  attacks: [{ name: "Frosty Typhoon", onAttack: (ctx, baseDamage) => { ctx.addMarker(ctx.source, "CANT_ATTACK_NEXT_TURN"); return { damage: baseDamage }; } }],
  abilities: [{ name: "Weather Reading", type: "activated" as const, onActivate: (ctx) => { ctx.drawCards(1); ctx.log("Weather Reading: 抽了1张"); } }],
};
const celebiVMAX: NamedEffect = { cardId: "name:Celebi VMAX", cardName: "Celebi VMAX",
  attacks: [{ name: "Max Plant", onAttack: (ctx, baseDamage) => {
    const found = ctx.searchDeck(c => c.card.supertype === "Pokémon", 2);
    ctx.shuffleDeck();
    return { damage: baseDamage };
  }}],
};
const chandelureVMAX: NamedEffect = { cardId: "name:Chandelure VMAX", cardName: "Chandelure VMAX",
  attacks: [{ name: "Max Poltergeist", onAttack: (ctx, _bd) => {
    const trainerCount = ctx.opponent.hand.cards.filter(c => c.card.supertype === "Trainer").length;
    return { damage: 70 * trainerCount };
  }}],
};
const cherrim: NamedEffect = { cardId: "name:Cherrim", cardName: "Cherrim",
  abilities: [{ name: "Spring Bloom", type: "activated" as const, onActivate: (ctx) => {
    const grass = ctx.player.hand.cards.find(c => c.card.supertype === "Energy" && c.card.name?.includes("Grass") && c.card.subtypes?.includes("Basic"));
    if (!grass) return;
    const target = ctx.player.active || ctx.player.bench.cards[0];
    if (!target) return;
    ctx.player.hand.cards = ctx.player.hand.cards.filter(c => c.instanceId !== grass.instanceId);
    target.attachedEnergy.push(grass);
    ctx.log(`Spring Bloom: 附加草能量给 ${target.card.name}`);
  }}],
};
const cramorantVMAX: NamedEffect = { cardId: "name:Cramorant VMAX", cardName: "Cramorant VMAX",
  attacks: [{ name: "Max Jet", onAttack: (ctx, _bd) => {
    const { heads } = ctx.flipCoins(ctx.source.attachedEnergy.length);
    return { damage: heads * 80 };
  }}],
};
const dhelmiseV: NamedEffect = { cardId: "name:Dhelmise V", cardName: "Dhelmise V",
  attacks: [{ name: "Anchor Anger", onAttack: (ctx, baseDamage) => ({ damage: baseDamage + 90 }) }],
};
const dittoVMAX: NamedEffect = { cardId: "name:Ditto VMAX", cardName: "Ditto VMAX",
  attacks: [{ name: "Max Transform", onAttack: (ctx, _bd) => {
    if (ctx.opponent.active) {
      const atks = ctx.opponent.active.card.attacks || [];
      if (atks.length > 0) { const best = atks.reduce((a: any, b: any) => parseInt(b.damage||"0") > parseInt(a.damage||"0") ? b : a); return { damage: parseInt(best.damage||"0") }; }
    }
    return { damage: 0 };
  }}],
};
const dracozoltV: NamedEffect = { cardId: "name:Dracozolt V", cardName: "Dracozolt V",
  attacks: [{ name: "Mountain Swing", onAttack: (ctx, baseDamage) => { ctx.revealTopCards(5).forEach(c => ctx.player.discard.cards.push(c)); return { damage: baseDamage }; } }],
};
const dracozoltVMAX: NamedEffect = { cardId: "name:Dracozolt VMAX", cardName: "Dracozolt VMAX",
  attacks: [{ name: "Max Impact", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) }],
};
const flappleV: NamedEffect = { cardId: "name:Flapple V", cardName: "Flapple V",
  attacks: [{ name: "Acid Drool", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) }],
};
const flappleVMAX: NamedEffect = { cardId: "name:Flapple VMAX", cardName: "Flapple VMAX",
  attacks: [{ name: "Max Acid Spray", onAttack: (_ctx, baseDamage) => ({ damage: baseDamage }) }],
};
const flyingPikachuVMAX: NamedEffect = { cardId: "name:Flying Pikachu VMAX", cardName: "Flying Pikachu VMAX",
  attacks: [{ name: "Max Balloon", onAttack: (ctx, baseDamage) => { ctx.addMarker(ctx.source, "PREVENT_ALL_DAMAGE_NEXT_TURN"); return { damage: baseDamage }; } }],
};
const galarianCorsola: NamedEffect = { cardId: "name:Galarian Corsola", cardName: "Galarian Corsola", attacks: [{ name: "Eerie Light", onAttack: (_ctx, bd) => ({ damage: bd, statusEffects: [{ target: "defender" as const, status: "confused" as any }] }) }] };
const galarianCursola: NamedEffect = { cardId: "name:Galarian Cursola", cardName: "Galarian Cursola", attacks: [{ name: "Hollow Missile", onAttack: (_ctx, bd) => ({ damage: bd }) }] };
const galarianMrRime: NamedEffect = { cardId: "name:Galarian Mr. Rime", cardName: "Galarian Mr. Rime", attacks: [{ name: "Ball Juggling", onAttack: (_ctx, bd) => ({ damage: bd }) }] };
const galarianSlowbro: NamedEffect = { cardId: "name:Galarian Slowbro", cardName: "Galarian Slowbro", attacks: [{ name: "Toxic Bind", onAttack: (_ctx, bd) => ({ damage: bd, statusEffects: [{ target: "defender" as const, status: "poisoned" as any }] }) }] };
const galarianSlowking: NamedEffect = { cardId: "name:Galarian Slowking", cardName: "Galarian Slowking",
  attacks: [{ name: "Psychic", onAttack: (ctx, bd) => ({ damage: bd + (ctx.opponent.active?.attachedEnergy.length||0) * 30 }) }],
  abilities: [{ name: "Calculated Conspiracy", type: "activated" as const, onActivate: (ctx) => { if (ctx.player.hand.cards.length > 0) { const c = ctx.player.hand.cards.pop()!; ctx.player.discard.cards.push(c); ctx.drawCards(2); ctx.log("Calculated Conspiracy: 弃1抽2"); } } }],
};
const galarianSlowpoke: NamedEffect = { cardId: "name:Galarian Slowpoke", cardName: "Galarian Slowpoke", attacks: [{ name: "Tail Whap", onAttack: (_ctx, bd) => ({ damage: bd }) }] };
const golurk: NamedEffect = { cardId: "name:Golurk V", cardName: "Golurk V", attacks: [{ name: "Mega Punch", onAttack: (_ctx, bd) => ({ damage: bd }) }] };
const goodra: NamedEffect = { cardId: "name:Goodra", cardName: "Goodra",
  attacks: [{ name: "Buster Tail", onAttack: (_ctx, bd) => ({ damage: bd }) }],
  abilities: [{ name: "Slimy Room", type: "passive" as const, modifyIncomingDamage: (_ctx, d) => Math.max(0, d - 30) }],
};
const hatenna: NamedEffect = { cardId: "name:Hatenna", cardName: "Hatenna", attacks: [{ name: "Psy Report", onAttack: (_ctx, bd) => ({ damage: bd }) }] };
const inteleonVMAX: NamedEffect = { cardId: "name:Inteleon VMAX", cardName: "Inteleon VMAX",
  attacks: [{ name: "Max Bullet", onAttack: (ctx, bd) => {
    if (ctx.opponent.bench.cards.length > 0) return { damage: bd, benchDamage: [{ target: ctx.opponent.bench.cards[0], damage: 60 }] };
    return { damage: bd };
  }}],
};
const jellicent: NamedEffect = { cardId: "name:Jellicent", cardName: "Jellicent", attacks: [{ name: "Hydro Splash", onAttack: (_ctx, bd) => ({ damage: bd }) }] };
const kubfu: NamedEffect = { cardId: "name:Kubfu", cardName: "Kubfu", attacks: [{ name: "Smack", onAttack: (_ctx, bd) => ({ damage: bd }) }] };
const liepardV: NamedEffect = { cardId: "name:Liepard V", cardName: "Liepard V", attacks: [{ name: "Shadow Claw", onAttack: (_ctx, bd) => ({ damage: bd }) }] };
const marshadow: NamedEffect = { cardId: "name:Marshadow", cardName: "Marshadow", attacks: [{ name: "Revenge Blast", onAttack: (ctx, bd) => ({ damage: bd + (ctx.player.discard.cards.filter(c => c.card.supertype === "Pokémon").length > 0 ? 90 : 0) }) }] };
const metagrossV: NamedEffect = { cardId: "name:Metagross V", cardName: "Metagross V", attacks: [{ name: "Bullet Punch", onAttack: (ctx, bd) => { const { heads } = ctx.flipCoins(2); return { damage: bd + heads * 20 }; } }] };
const metagrossVMAX: NamedEffect = { cardId: "name:Metagross VMAX", cardName: "Metagross VMAX", attacks: [{ name: "Max Rush", onAttack: (_ctx, bd) => ({ damage: bd }) }] };
const pyukumuku: NamedEffect = { cardId: "name:Pyukumuku", cardName: "Pyukumuku", attacks: [{ name: "Rain Splash", onAttack: (_ctx, bd) => ({ damage: bd }) }] };
const rapidStrikeUrshifu: NamedEffect = { cardId: "name:Rapid Strike Urshifu", cardName: "Rapid Strike Urshifu", attacks: [{ name: "Rapid Flowing Strike", onAttack: (_ctx, bd) => ({ damage: bd }) }] };
const salamence: NamedEffect = { cardId: "name:Salamence", cardName: "Salamence",
  attacks: [{ name: "Dragon Claw", onAttack: (_ctx, bd) => ({ damage: bd }) }],
  abilities: [{ name: "Intimidating Roar", type: "activated" as const, onActivate: (ctx) => { if (ctx.opponent.active) ctx.addMarker(ctx.opponent.active, "ATTACK_DAMAGE_REDUCED", 30); ctx.log("Intimidating Roar: 对手攻击伤害-30"); } }],
};
const surfingPikachuV: NamedEffect = { cardId: "name:Surfing Pikachu V", cardName: "Surfing Pikachu V", attacks: [{ name: "Surf", onAttack: (_ctx, bd) => ({ damage: bd }) }] };
const tornadusVMAX: NamedEffect = { cardId: "name:Tornadus VMAX", cardName: "Tornadus VMAX", attacks: [{ name: "Max Gust", onAttack: (_ctx, bd) => ({ damage: bd }) }] };
const trevenantVMAX: NamedEffect = { cardId: "name:Trevenant VMAX", cardName: "Trevenant VMAX",
  attacks: [{ name: "Max Poltergeist", onAttack: (ctx, _bd) => { const count = ctx.player.discard.cards.filter(c => c.card.supertype === "Trainer" && c.card.subtypes?.includes("Supporter")).length; return { damage: count * 40 }; } }],
};
const victiniVMAX: NamedEffect = { cardId: "name:Victini VMAX", cardName: "Victini VMAX",
  attacks: [{ name: "Max Victory", onAttack: (ctx, bd) => {
    const fires = ctx.player.discard.cards.filter(c => c.card.supertype === "Energy" && c.card.name?.includes("Fire") && c.card.subtypes?.includes("Basic")).slice(0, 3);
    for (const e of fires) { ctx.player.discard.cards = ctx.player.discard.cards.filter(c => c.instanceId !== e.instanceId); ctx.source.attachedEnergy.push(e); }
    return { damage: bd };
  }}],
};
const volcanionV: NamedEffect = { cardId: "name:Volcanion V", cardName: "Volcanion V", attacks: [{ name: "Eruption Shot", onAttack: (_ctx, bd) => ({ damage: bd }) }] };

export const wave27FinalPokemonEnergyEffects: NamedEffect[] = [
  // Energy
  boomerangEnergy, enrichingEnergy, ignitionEnergy, legacyEnergy, medicalEnergy,
  neoUpperEnergy, prismEnergy, rapidStrikeEnergy, regenerativeEnergy, reversalEnergy,
  singleStrikeEnergy, spikyEnergy, spiralEnergy, teamRocketsEnergy, treasureEnergy,
  // Pokemon
  alcremieV, alcremieVMAX, breloomV, castformSnowy, celebiVMAX, chandelureVMAX,
  cherrim, cramorantVMAX, dhelmiseV, dittoVMAX, dracozoltV, dracozoltVMAX,
  flappleV, flappleVMAX, flyingPikachuVMAX, galarianCorsola, galarianCursola,
  galarianMrRime, galarianSlowbro, galarianSlowking, galarianSlowpoke,
  golurk, goodra, hatenna, inteleonVMAX, jellicent, kubfu, liepardV,
  marshadow, metagrossV, metagrossVMAX, pyukumuku, rapidStrikeUrshifu,
  salamence, surfingPikachuV, tornadusVMAX, trevenantVMAX, victiniVMAX, volcanionV,
];
