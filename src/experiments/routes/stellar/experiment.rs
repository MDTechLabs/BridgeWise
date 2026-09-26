pub struct RouteExperiment {
    pub id: String,
    pub control: Box<dyn RankingStrategy>,
    pub treatment: Box<dyn RankingStrategy>,
}