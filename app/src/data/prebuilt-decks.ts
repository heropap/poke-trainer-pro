/**
 * Prebuilt Decks — Standard format sample decks for quick import.
 *
 * These decks allow new users to start playing immediately without
 * needing to import their own PTCG Live deck codes.
 *
 * Each deck uses cards from the SV-era sets that are present in our database.
 */

export interface PrebuiltDeck {
  /** Display name */
  name: string;
  /** Short description */
  description: string;
  /** Deck archetype/strategy tag */
  archetype: string;
  /** PTCG Live format deck text */
  deckText: string;
}

export const PREBUILT_DECKS: PrebuiltDeck[] = [
  {
    name: "Charizard ex",
    description: "火系进化打击型，Charizard ex 配合 Pidgeot ex 稳定检索",
    archetype: "Fire / Evolution",
    deckText: `Pokémon: 18
4 Charmander OBF 26
3 Charmeleon OBF 27
3 Charizard ex OBF 125
2 Pidgey OBF 162
2 Pidgeot ex OBF 164
4 Mew CEL 11

Trainer: 30
4 Professor's Research SVI 190
4 Boss's Orders PAL 172
4 Rare Candy SVI 191
4 Ultra Ball SVI 196
4 Nest Ball SVI 181
2 Iono PAL 185
2 Switch SVI 194
2 Super Rod PAL 188
2 Energy Retrieval SVI 171
2 Arven SVI 186

Energy: 12
12 Basic Fire Energy SVE 2`,
  },
  {
    name: "Lugia VSTAR",
    description: "无色系大攻击力，Archeops 加速特殊能量",
    archetype: "Colorless / VSTAR",
    deckText: `Pokémon: 16
4 Lugia V SIT 138
3 Lugia VSTAR SIT 139
4 Archeops SIT 147
2 Lumineon V BRS 40
1 Yveltal SHF 46
2 Dunsparce FST 207

Trainer: 32
4 Professor's Research SVI 190
4 Boss's Orders PAL 172
4 Ultra Ball SVI 196
4 Nest Ball SVI 181
4 Capturing Aroma SIT 153
2 Iono PAL 185
2 Switch SVI 194
2 Choice Belt PAL 176
2 Energy Retrieval SVI 171
2 Collapsed Stadium BRS 137
2 Lost Vacuum CRZ 135

Energy: 12
4 Double Turbo Energy BRS 151
4 V Guard Energy SIT 169
4 Gift Energy LOR 171`,
  },
  {
    name: "Gardevoir ex",
    description: "超能系能量加速，Gardevoir 特性无限贴能",
    archetype: "Psychic / Ability",
    deckText: `Pokémon: 18
4 Ralts SVI 67
3 Kirlia SVI 68
3 Gardevoir ex SVI 86
1 Gallade ASR 62
2 Zacian V CEL 16
2 Mew CEL 11
1 Cresselia LOR 74
2 Drifloon SVI 89

Trainer: 30
4 Professor's Research SVI 190
4 Boss's Orders PAL 172
4 Level Ball BST 129
4 Rare Candy SVI 191
4 Ultra Ball SVI 196
2 Iono PAL 185
2 Switch SVI 194
2 Super Rod PAL 188
2 Fog Crystal CRE 140
2 Arven SVI 186

Energy: 12
12 Basic Psychic Energy SVE 5`,
  },
  {
    name: "Miraidon ex",
    description: "雷系快攻，Miraidon ex 特性快速铺场",
    archetype: "Lightning / Speed",
    deckText: `Pokémon: 14
3 Miraidon ex SVI 81
4 Flaaffy EVS 55
4 Mareep EVS 54
1 Raikou V BRS 48
2 Regieleki VMAX SIT 58

Trainer: 34
4 Professor's Research SVI 190
4 Boss's Orders PAL 172
4 Ultra Ball SVI 196
4 Nest Ball SVI 181
4 Electric Generator SVI 170
2 Iono PAL 185
2 Switch SVI 194
2 Energy Retrieval SVI 171
2 Choice Belt PAL 176
2 Beach Court SVI 167
2 Super Rod PAL 188
2 Exp. Share SVI 174

Energy: 12
12 Basic Lightning Energy SVE 4`,
  },
  {
    name: "Lost Zone Box",
    description: "失落区战术，Comfey 引擎快速积累失落区",
    archetype: "Multi-type / Lost Zone",
    deckText: `Pokémon: 14
4 Comfey LOR 79
2 Cramorant LOR 50
2 Sableye LOR 70
1 Dragonite V SIT 49
1 Kyogre CEL 3
2 Manaphy BRS 41
2 Radiant Greninja ASR 46

Trainer: 36
4 Colress's Experiment LOR 155
4 Boss's Orders PAL 172
4 Battle VIP Pass FST 225
4 Mirage Gate LOR 163
4 Nest Ball SVI 181
4 Switch Cart ASR 154
2 Iono PAL 185
2 Escape Rope BST 125
2 Lost Vacuum CRZ 135
2 Flower Selecting LOR 147
2 Beach Court SVI 167
2 Energy Recycler BST 124

Energy: 10
4 Basic Water Energy SVE 3
3 Basic Psychic Energy SVE 5
3 Basic Fire Energy SVE 2`,
  },
];
