import sqlite3

try:
    con = sqlite3.connect('violations.db')
    cur = con.cursor()
    cur.execute("UPDATE violations SET approval_probability=0.8, congestion_impact_score=55.0, choke_point_impact=1.5 WHERE status='active'")
    con.commit()
    con.close()
    print("Successfully updated database")
except Exception as e:
    print(f"Error: {e}")
