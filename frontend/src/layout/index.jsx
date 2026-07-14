import React from "react";
import { Layout } from "antd";

const { Header, Content, Footer, Sider } = Layout;

const layoutStyle = { minHeight: "100vh" };
const siderStyle = { color: "#fff", textAlign: "center" };
const headerStyle = { color: "#fff", textAlign: "center" };
const contentStyle = { color: "#fff", textAlign: "center" };
const footerStyle = { color: "#fff", textAlign: "center" };

const Structure = () => {
  return (
    <div>
      {" "}
      <Layout style={layoutStyle}>
        <Sider width="25%" style={siderStyle}>
          Sider
        </Sider>
        <Layout>
          <Header style={headerStyle}>Header</Header>
          <Content style={contentStyle}>Content</Content>
          <Footer style={footerStyle}>Footer</Footer>
        </Layout>
      </Layout>
    </div>
  );
};

export default Structure;
