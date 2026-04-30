import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import AuthPage from "./pages/AuthPage";
import CopyProgressPage from "./pages/CopyProgressPage";
import CreatePlaylistPage from "./pages/CreatePlaylistPage";
import HomePage from "./pages/HomePage";
import LikedSongsPage from "./pages/LikedSongsPage";
import SuccessPage from "./pages/SuccessPage";

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/liked" element={<LikedSongsPage />} />
        <Route path="/playlist" element={<CreatePlaylistPage />} />
        <Route path="/copy" element={<CopyProgressPage />} />
        <Route path="/success" element={<SuccessPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

