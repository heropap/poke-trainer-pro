import { render, screen, fireEvent } from "@testing-library/react";
import CardImage from "@/components/card/CardImage";
import CardDetail from "@/components/card/CardDetail";
import CardGrid from "@/components/card/CardGrid";
import { Card } from "@/types/card";

// Test fixtures
const mockPokemonCard: Card = {
  id: "sv1-1",
  name: "Pineco",
  supertype: "Pokémon",
  subtypes: ["Basic"],
  hp: "60",
  types: ["Grass"],
  attacks: [
    {
      cost: ["Colorless", "Colorless"],
      name: "Guard Press",
      damage: "10",
      text: "During your opponent's next turn, this Pokémon takes 30 less damage.",
      convertedEnergyCost: 2,
    },
  ],
  weaknesses: [{ type: "Fire", value: "×2" }],
  retreatCost: ["Colorless", "Colorless"],
  convertedRetreatCost: 2,
  number: "1",
  rarity: "Common",
  legalities: { unlimited: "Legal", standard: "Legal", expanded: "Legal" },
  regulationMark: "G",
  images: {
    small: "https://images.pokemontcg.io/sv1/1.png",
    large: "https://images.pokemontcg.io/sv1/1_hires.png",
  },
  flavorText: "It spits out a fluid that it uses to glue tree bark to its body.",
  set: "sv1",
};

const mockExCard: Card = {
  id: "sv2-50",
  name: "Charizard ex",
  supertype: "Pokémon",
  subtypes: ["Stage 2", "ex"],
  hp: "330",
  types: ["Fire"],
  evolvesFrom: "Charmeleon",
  abilities: [
    {
      name: "Infernal Reign",
      text: "When you play this card from your hand to evolve 1 of your Pokémon, you may search your deck for up to 3 basic Energy cards.",
      type: "Ability",
    },
  ],
  attacks: [
    {
      cost: ["Fire", "Fire"],
      name: "Burning Darkness",
      damage: "180+",
      text: "This attack does 30 more damage for each Prize card your opponent has taken.",
      convertedEnergyCost: 2,
    },
  ],
  weaknesses: [{ type: "Water", value: "×2" }],
  retreatCost: ["Colorless", "Colorless"],
  convertedRetreatCost: 2,
  number: "50",
  legalities: { unlimited: "Legal", standard: "Legal", expanded: "Legal" },
  images: {
    small: "https://images.pokemontcg.io/sv2/50.png",
    large: "https://images.pokemontcg.io/sv2/50_hires.png",
  },
  set: "sv2",
};

const mockTrainerCard: Card = {
  id: "sv1-200",
  name: "Professor's Research",
  supertype: "Trainer",
  subtypes: ["Supporter"],
  number: "200",
  legalities: { unlimited: "Legal", standard: "Legal", expanded: "Legal" },
  images: {
    small: "https://images.pokemontcg.io/sv1/200.png",
    large: "https://images.pokemontcg.io/sv1/200_hires.png",
  },
  set: "sv1",
};

describe("CardImage", () => {
  it("渲染卡牌图片", () => {
    render(<CardImage card={mockPokemonCard} />);
    const img = screen.getByAltText("Pineco");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute(
      "src",
      "https://images.pokemontcg.io/sv1/1.png"
    );
  });

  it("使用 data-testid 标识", () => {
    render(<CardImage card={mockPokemonCard} />);
    expect(screen.getByTestId("card-image-sv1-1")).toBeInTheDocument();
  });

  it("点击时触发 onClick 回调", () => {
    const handleClick = jest.fn();
    render(<CardImage card={mockPokemonCard} onClick={handleClick} />);
    fireEvent.click(screen.getByTestId("card-image-sv1-1"));
    expect(handleClick).toHaveBeenCalledWith(mockPokemonCard);
  });

  it("可通过键盘触发 onClick", () => {
    const handleClick = jest.fn();
    render(<CardImage card={mockPokemonCard} onClick={handleClick} />);
    const el = screen.getByTestId("card-image-sv1-1");
    fireEvent.keyDown(el, { key: "Enter" });
    expect(handleClick).toHaveBeenCalledWith(mockPokemonCard);
  });

  it("没有 onClick 时不显示 cursor-pointer", () => {
    render(<CardImage card={mockPokemonCard} />);
    const el = screen.getByTestId("card-image-sv1-1");
    expect(el.className).not.toContain("cursor-pointer");
  });

  it("图片加载失败时显示卡牌名称", () => {
    render(<CardImage card={mockPokemonCard} />);
    const img = screen.getByAltText("Pineco");
    fireEvent.error(img);
    expect(screen.getByText("Pineco")).toBeInTheDocument();
  });
});

describe("CardDetail", () => {
  it("显示卡牌名称和 HP", () => {
    render(<CardDetail card={mockPokemonCard} />);
    expect(screen.getByText("Pineco")).toBeInTheDocument();
    expect(screen.getByText("60 HP")).toBeInTheDocument();
  });

  it("显示卡牌类型", () => {
    render(<CardDetail card={mockPokemonCard} />);
    expect(screen.getByTestId("type-badge-Grass")).toBeInTheDocument();
  });

  it("显示技能信息", () => {
    render(<CardDetail card={mockPokemonCard} />);
    expect(screen.getByText("Guard Press")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("显示特性信息（ex 卡）", () => {
    render(<CardDetail card={mockExCard} />);
    expect(screen.getByText("Infernal Reign")).toBeInTheDocument();
  });

  it("显示弱点和撤退费用", () => {
    render(<CardDetail card={mockPokemonCard} />);
    expect(screen.getByText(/Fire ×2/)).toBeInTheDocument();
  });

  it("显示 Standard 合法标记", () => {
    render(<CardDetail card={mockPokemonCard} />);
    expect(screen.getByText("Standard")).toBeInTheDocument();
  });

  it("显示 Trainer 卡的子类型", () => {
    render(<CardDetail card={mockTrainerCard} />);
    expect(screen.getByText("Supporter")).toBeInTheDocument();
  });

  it("显示 flavor text", () => {
    render(<CardDetail card={mockPokemonCard} />);
    expect(
      screen.getByText(/It spits out a fluid/)
    ).toBeInTheDocument();
  });

  it("关闭按钮触发 onClose 回调", () => {
    const handleClose = jest.fn();
    render(<CardDetail card={mockPokemonCard} onClose={handleClose} />);
    fireEvent.click(screen.getByLabelText("关闭"));
    expect(handleClose).toHaveBeenCalled();
  });
});

describe("CardGrid", () => {
  const cards = [mockPokemonCard, mockExCard, mockTrainerCard];

  it("渲染所有卡牌", () => {
    render(<CardGrid cards={cards} />);
    expect(screen.getByTestId("card-grid")).toBeInTheDocument();
    expect(screen.getByTestId("card-image-sv1-1")).toBeInTheDocument();
    expect(screen.getByTestId("card-image-sv2-50")).toBeInTheDocument();
    expect(screen.getByTestId("card-image-sv1-200")).toBeInTheDocument();
  });

  it("显示卡牌总数", () => {
    render(<CardGrid cards={cards} />);
    expect(screen.getByText("共 3 张卡牌")).toBeInTheDocument();
  });

  it("空数组时显示提示信息", () => {
    render(<CardGrid cards={[]} />);
    expect(screen.getByTestId("card-grid-empty")).toBeInTheDocument();
    expect(screen.getByText("没有找到卡牌")).toBeInTheDocument();
  });

  it("自定义空提示信息", () => {
    render(<CardGrid cards={[]} emptyMessage="无结果" />);
    expect(screen.getByText("无结果")).toBeInTheDocument();
  });

  it("点击卡牌显示详情", () => {
    render(<CardGrid cards={cards} />);
    fireEvent.click(screen.getByTestId("card-image-sv2-50"));
    expect(screen.getByTestId("card-detail-sv2-50")).toBeInTheDocument();
    expect(screen.getByText("Charizard ex")).toBeInTheDocument();
    expect(screen.getByText("330 HP")).toBeInTheDocument();
  });

  it("再次点击同一卡牌关闭详情", () => {
    render(<CardGrid cards={cards} />);
    fireEvent.click(screen.getByTestId("card-image-sv2-50"));
    expect(screen.getByTestId("card-detail-sv2-50")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("card-image-sv2-50"));
    expect(screen.queryByTestId("card-detail-sv2-50")).not.toBeInTheDocument();
  });
});
