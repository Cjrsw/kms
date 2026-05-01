import { HomeCarousel } from "../../components/home-carousel";
import { HomeRightPanel } from "../../components/home-right-panel";
import { getHomeCarousel, getHomeDashboard } from "../../lib/api";

export default async function HomePage() {
  const [carousel, dashboard] = await Promise.all([getHomeCarousel(), getHomeDashboard()]);

  return (
    <div className="kms-home-view">
      <HomeCarousel slides={carousel.slides} />

      <div className="kms-vertical-divider">
        <div />
      </div>

      <HomeRightPanel
        activities={dashboard.activities}
        announcement={dashboard.announcement}
        latestNotes={dashboard.latest_notes}
      />
    </div>
  );
}
