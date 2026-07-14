import React from "react";
import { ConfigProvider } from "antd";
import Structure from "./layout";
import antdTheme from "./shared/theme";
import "./App.css";

const App = () => {
  return (
    <ConfigProvider theme={antdTheme}>
      <Structure />
    </ConfigProvider>
  );
};

export default App;
