import HFTGame from "./HFTGame";
import { AudioProvider } from "./AudioContext";

export default function App() {
  return (
    <AudioProvider>
      <HFTGame />
    </AudioProvider>
  );
}
