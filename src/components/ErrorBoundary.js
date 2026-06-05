import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }
  componentDidCatch(error, info) {
    this.setState({ error, info });
    console.error("ErrorBoundary caught:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 20, background: "#FEF2F2", minHeight: "100vh" }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#EF4444", marginBottom: 10 }}>
            💥 App crashed — error details:
          </div>
          <div style={{ fontSize: 13, color: "#7F1D1D", background: "#fff", padding: 12, borderRadius: 8, marginBottom: 10, wordBreak: "break-all" }}>
            {this.state.error?.toString()}
          </div>
          <div style={{ fontSize: 11, color: "#991B1B", background: "#fff", padding: 12, borderRadius: 8, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
            {this.state.info?.componentStack?.slice(0, 500)}
          </div>
          <button onClick={() => this.setState({ error: null, info: null })}
            style={{ marginTop: 12, padding: "8px 16px", background: "#EF4444", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
