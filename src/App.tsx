import { Editor } from "./components/Editor";
import { Preview } from "./components/Preview";
import { TopBar } from "./components/TopBar";
import { FontProvider } from "./state/fonts";
import { StoreProvider } from "./state/store";

export function App() {
  return (
    <FontProvider>
      <StoreProvider>
        <div className="app">
          <TopBar />
          <div className="workspace">
            <Editor />
            <Preview />
          </div>
        </div>
      </StoreProvider>
    </FontProvider>
  );
}
