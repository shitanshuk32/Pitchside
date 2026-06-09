// This is the main application component that sets up routing for the entire app. It includes a Navbar and defines routes for different pages such as Home, Leaderboard, Sign In, Sign Up, Create Posts, and Feed. The Create Posts and Feed routes are protected and require authentication to access. If a user tries to access a route that doesn't exist, they will be directed to a Not Found page.
import { Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import CreatePosts from "./pages/CreatePosts";
import Feed from "./pages/Feed";
import Leaderboard from "./pages/Leaderboard";
import SignInPage from "./pages/SignInPage";
import SignUpPage from "./pages/SignUpPage";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";
import Navbar from "./components/Navbar";

const App = () => {
  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/sign-in/*" element={<SignInPage />} />
        <Route path="/sign-up/*" element={<SignUpPage />} />
        <Route
          path="/create_a_post"
          element={
            <ProtectedRoute>
              <CreatePosts />
            </ProtectedRoute>
          }
        />
        <Route
          path="/get_all_posts"
          element={
            <ProtectedRoute>
              <Feed />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
};

export default App;
