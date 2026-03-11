from app.db import get_db
from sqlmodel import select
from app.models import Poll, PollEvent, Vote, User, Session

db = next(get_db())

# Get active poll
poll = db.exec(select(Poll).where(Poll.status.in_(['OPEN', 'CLOSED']))).first()
print(f'Poll: {poll.title} (ID: {poll.id})')

# Get movies in poll
poll_events = db.exec(select(PollEvent).where(PollEvent.poll_id == poll.id)).all()
print(f'Movies in poll: {len(poll_events)}')
for pe in poll_events:
    print(f'  Event ID: {pe.event_id}')

# Get Tony's votes
tony = db.exec(select(User).where(User.name == 'Tony')).first()
if tony:
    print(f'\nTony user ID: {tony.id}')
    votes = db.exec(select(Vote).where(Vote.user_id == tony.id, Vote.poll_id == poll.id)).all()
    print(f'Tony votes: {len(votes)}')
    for v in votes:
        print(f'  - {v.target_type} {v.target_id}: {v.vote_value}')
    
    # Get included sessions
    sessions = db.exec(select(Session).where(
        Session.poll_id == poll.id,
        Session.is_included == True
    )).all()
    print(f'\nIncluded sessions: {len(sessions)}')
    for s in sessions:
        print(f'  Session ID {s.id}: event {s.event_id}, {s.session_date} {s.session_time}')
else:
    print('Tony not found in database')

# Get all users
users = db.exec(select(User).where(User.is_admin == False)).all()
print(f'\nNon-admin users: {len(users)}')
for u in users:
    print(f'  - {u.name} (ID: {u.id})')
