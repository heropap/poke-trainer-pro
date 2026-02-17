import {
  ExternalState,
  ExternalPlayer,
  PokemonCardList,
  ExternalCard,
  CardList,
  CardSuperType
} from "./external-types";

// ─── Mock Engine (Simulating RyuuPlay Logic) ───
// This represents the "Transplanted Core" that we control.
// It implements strict rules for Energy, Evolution, and Damage.

export class MockEngine {
  private state: ExternalState;

  constructor(initialState: ExternalState) {
    this.state = JSON.parse(JSON.stringify(initialState)); // Deep copy
  }

  public getState(): ExternalState {
    return JSON.parse(JSON.stringify(this.state));
  }

  // ─── Core Actions ───

  public playEnergy(playerId: string, cardId: string, targetPokemonId: string): { success: boolean; message?: string } {
    const player = this.getPlayer(playerId);
    if (!player) return { success: false, message: "Player not found" };

    // Rule: One energy attachment per turn
    if (player.energyPlayedTurn === this.state.turn) {
      return { success: false, message: "已经贴过能量了 (Rule: One per turn)" };
    }

    const cardIndex = player.hand.cards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return { success: false, message: "Hand card not found" };
    const card = player.hand.cards[cardIndex];

    if (card.superType !== "Energy") return { success: false, message: "Not an Energy card" };

    const target = this.findPokemon(player, targetPokemonId);
    if (!target) return { success: false, message: "Target Pokemon not found" };

    // Execute: Move card from hand to Pokemon
    player.hand.cards.splice(cardIndex, 1);
    target.cards.push(card);
    player.energyPlayedTurn = this.state.turn;

    this.log(`${player.name} attached ${card.name} to ${target.cards[0].name}.`);
    return { success: true };
  }

  public evolvePokemon(playerId: string, cardId: string, targetPokemonId: string): { success: boolean; message?: string } {
    const player = this.getPlayer(playerId);
    if (!player) return { success: false, message: "Player not found" };

    // Rule: Cannot evolve on first turn
    if (this.state.turn === 1 && player.id === this.state.players[0].id) { // Simplified first turn check
       return { success: false, message: "第一回合不能进化 (Rule: No evolve turn 1)" };
    }

    const cardIndex = player.hand.cards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return { success: false, message: "Hand card not found" };
    const evoCard = player.hand.cards[cardIndex];

    const target = this.findPokemon(player, targetPokemonId);
    if (!target) return { success: false, message: "Target Pokemon not found" };

    const basePokemon = target.cards[0];

    // Rule: Name match (e.g. Charmeleon evolves from Charmander)
    // In a real engine, we check `evolvesFrom` field.
    // Here we simulate it with a simple check or assume valid for mock if names align.
    // For this mock, let's assume if it's Stage 1, it evolves from Basic.
    // Simple check: Charmeleon evolves from Charmander
    if (evoCard.name === "Charmeleon" && basePokemon.name !== "Charmander") {
        return { success: false, message: "Evolution target mismatch" };
    }
    
    // Check if target was played this turn (Summoning Sickness)
    // We don't track `playedTurn` on Pokemon in this simplified mock, but we should.
    // Let's assume for now it's valid if we don't track it.

    // Execute: Move card from hand to TOP of Pokemon stack
    player.hand.cards.splice(cardIndex, 1);
    target.cards.unshift(evoCard); // Evolution goes on top!
    
    // Clear special conditions on evolve
    target.specialConditions = [];
    
    this.log(`${player.name} evolved ${basePokemon.name} into ${evoCard.name}.`);
    return { success: true };
  }

  public playTrainer(playerId: string, cardId: string, targetId?: string): { success: boolean; message?: string } {
    const player = this.getPlayer(playerId);
    if (!player) return { success: false, message: "Player not found" };

    const cardIndex = player.hand.cards.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return { success: false, message: "Hand card not found" };
    const card = player.hand.cards[cardIndex];

    if (card.superType !== "Trainer") return { success: false, message: "Not a Trainer card" };

    // Rule: Supporter once per turn
    if (card.subType === "Supporter") {
        if (player.supporterPlayedTurn === this.state.turn) {
            return { success: false, message: "Already played a Supporter this turn" };
        }
    }

    // Effect Logic (Mock)
    if (card.name === "Potion") {
        if (!targetId) return { success: false, message: "Potion requires a target" };
        const target = this.findPokemon(player, targetId);
        if (!target) return { success: false, message: "Target not found" };
        
        target.damage = Math.max(0, target.damage - 30);
        this.log(`${player.name} used Potion on ${target.cards[0].name}, healed 30 damage.`);
    } else if (card.name === "Professor's Research") {
        // Discard hand
        player.discard.cards.push(...player.hand.cards);
        player.hand.cards = [];
        
        // Draw 7
        // (Mock deck is empty, so let's generate cards for demo)
        const mockDeckCards = Array(7).fill({ id: "mock-draw", name: "Mock Card", superType: "Trainer" });
        player.hand.cards.push(...mockDeckCards);
        
        this.log(`${player.name} used Professor's Research. Discarded hand, drew 7 cards.`);
    }

    // Execute: Move to discard (unless it stays in play, but Potion/Research go to discard)
    // Note: If we discarded hand above, card is already gone.
    // So check if card is still in hand
    const currentIndex = player.hand.cards.findIndex(c => c.id === cardId);
    if (currentIndex !== -1) {
        player.hand.cards.splice(currentIndex, 1);
        player.discard.cards.push(card);
    }

    if (card.subType === "Supporter") {
        player.supporterPlayedTurn = this.state.turn;
    }

    return { success: true };
  }

  public attack(playerId: string, attackName: string): { success: boolean; message?: string } {
    const player = this.getPlayer(playerId);
    const opponent = this.getOpponent(playerId);
    if (!player || !opponent) return { success: false, message: "Players not found" };

    const active = player.active;
    if (!active) return { success: false, message: "No active Pokemon" };

    // 1. Find Attack
    const attack = active.cards[0].attacks?.find(a => a.name === attackName);
    if (!attack) return { success: false, message: "Attack not found" };

    // 2. Check Energy Cost (Simplified: count total energy)
    const energyCount = active.cards.filter(c => c.superType === "Energy").length;
    // Assume attack needs 1 energy for now or check cost
    // if (energyCount < attack.cost.length) ...

    // 3. Calculate Damage
    let damage = attack.damage || 0;
    
    // Apply Weakness
    const defender = opponent.active;
    if (defender) {
      const defenderCard = defender.cards[0];
      const attackerType = active.cards[0].types?.[0];
      
      if (defenderCard.weakness?.some(w => w.type === attackerType)) {
        damage *= 2;
        this.log("Weakness applied! x2 damage.");
      }

      // Apply Resistance
      if (defenderCard.resistance?.some(r => r.type === attackerType)) {
        damage -= 30;
        this.log("Resistance applied! -30 damage.");
      }

      // Apply Damage to Defender
      defender.damage += Math.max(0, damage);
      
      this.log(`${player.name}'s ${active.cards[0].name} used ${attackName} for ${damage} damage!`);

      // Check Knockout
      if (defender.damage >= (defenderCard.hp || 0)) {
        this.log(`${defenderCard.name} is knocked out!`);
        opponent.active = null; // Simplified knockout
        // Take Prize
        if (player.prizes.length > 0) {
            const prize = player.prizes.shift();
            if (prize) {
                player.hand.cards.push(...prize.cards);
                this.log(`${player.name} took a prize card!`);
            }
        }
      }
    }

    // End turn automatically after attack
    this.endTurn();
    return { success: true };
  }

  public endTurn(): void {
    const currentPlayerIdx = this.state.activePlayer;
    const nextPlayerIdx = currentPlayerIdx === 0 ? 1 : 0;
    
    this.state.activePlayer = nextPlayerIdx;
    this.state.turn++;
    
    this.log(`Turn ${this.state.turn} started for Player ${nextPlayerIdx === 0 ? "1" : "2"}.`);
    
    // Draw card for next player
    const nextPlayer = this.state.players[nextPlayerIdx];
    if (nextPlayer.deck.cards.length > 0) {
      const card = nextPlayer.deck.cards.shift();
      if (card) {
        nextPlayer.hand.cards.push(card);
      }
    }
  }

  // ─── Helpers ───

  private getPlayer(id: string): ExternalPlayer | undefined {
    return this.state.players.find(p => p.id === id);
  }

  private getOpponent(id: string): ExternalPlayer | undefined {
    return this.state.players.find(p => p.id !== id);
  }

  private findPokemon(player: ExternalPlayer, pokemonId: string): PokemonCardList | undefined {
    if (player.active?.pokemonId === pokemonId) return player.active;
    return player.bench.find(p => p.pokemonId === pokemonId);
  }

  private log(message: string): void {
    this.state.log.push({
      message,
      timestamp: Date.now()
    });
  }
}
