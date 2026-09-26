pub trait RankingStrategy {
    fn rank(&self, routes: Vec<Route>) -> Vec<Route>;
}