import { Heart, Star, Zap, Cloud, Sun, Moon, Flame, Droplet, Leaf, Anchor, Camera, Music2, Gift, Rocket, Ghost, Bug, Fish, Bird, Cat, Dog } from 'lucide-react';

// Index must line up with memoryEngine's SYMBOL_COUNT (20) -- symbol ID is
// just an index into this pool. Purely a rendering concern; the engine
// itself never imports or knows about these.
export const ICON_POOL = [
  Heart, Star, Zap, Cloud, Sun, Moon, Flame, Droplet, Leaf, Anchor,
  Camera, Music2, Gift, Rocket, Ghost, Bug, Fish, Bird, Cat, Dog,
];
