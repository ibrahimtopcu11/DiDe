
"""Ankara Civarında Random Olay Üretici"""


#pip install psycopg2-binary python-dotenv
# Usage: python generate_events.py
import psycopg2
import random
from datetime import datetime, timedelta
from dotenv import load_dotenv
import os

load_dotenv()

# Database connection information
DB_CONFIG = {
    'host': os.getenv('PGHOST'),
    'port': int(os.getenv('PGPORT')),
    'user': os.getenv('PGUSER'),
    'password': os.getenv('PGPASSWORD'),
    'database': os.getenv('PGDATABASE')
}

# Ankara neighborhood centers
DISTRICTS = [
    {'lat': 39.9180, 'lng': 32.8620}, {'lat': 39.9686, 'lng': 32.8580},
    {'lat': 39.9520, 'lng': 32.7850}, {'lat': 39.9180, 'lng': 32.9100},
    {'lat': 39.9180, 'lng': 32.6770}, {'lat': 39.9680, 'lng': 32.5780},
    {'lat': 39.9450, 'lng': 32.8780}, {'lat': 39.7890, 'lng': 32.8100},
]

def get_coords():
    """Random Ankara koordinatı"""
    d = random.choice(DISTRICTS)
    return round(d['lat'] + random.uniform(-0.02, 0.02), 6), \
           round(d['lng'] + random.uniform(-0.02, 0.02), 6)

def get_date():
    """Son 60 gün içinde random tarih"""
    return datetime.now() - timedelta(
        days=random.randint(0, 60),
        hours=random.randint(0, 23),
        minutes=random.randint(0, 59)
    )

def get_desc(name, good):
    """Olay açıklaması"""
    descs = {
        True: f'{name} - Bölgede tespit edildi ve hizmet veriliyor',
        False: f'{name} - Olay yerine ekipler sevk edildi'
    }
    return descs.get(good, f'{name} bildirimi')

def main():
    print("=" * 50)
    print(" ANKARA RANDOM OLAY ÜRETİCİ")
    print("=" * 50)
    
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        print(f"\n Database bağlantısı: {DB_CONFIG['database']}")
    except Exception as e:
        print(f"\n Bağlantı hatası: {e}")
        return
    
    try:
        user_id = int(input("\n👤 Kullanıcı ID: "))
        
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, username, role, email FROM users "
            "WHERE id=%s AND COALESCE(is_active,true)=true",
            (user_id,)
        )
        user = cursor.fetchone()
        
        if not user:
            print(f" ID {user_id} bulunamadı!")
            return
        
        print(f"ullanıcı: {user[1]} ({user[2]})")
        
        cursor.execute(
            "SELECT o_id, o_adi, good FROM olaylar "
            "WHERE COALESCE(active,true)=true"
        )
        types = cursor.fetchall()
        
        if not types:
            print("Aktif olay türü yok!")
            return
        
        print(f"{len(types)} aktif olay türü bulundu")
        
        count = int(input("Kaç olay?: "))
        
        if count <= 0:
            print("Geçersiz sayı!")
            return
        
        # Approval
        confirm = input(f"\n{user[1]} için {count} olay eklensin? (e/h): ")
        if confirm.lower() != 'e':
            print("İptal edildi")
            return
        
        print(f"\n Ekleniyor...")
        inserted = 0
        
        for i in range(count):
            t = random.choice(types)
            lat, lng = get_coords()
            date = get_date()
            desc = get_desc(t[1], t[2])
            
            cursor.execute("""
                INSERT INTO olay (
                    enlem, boylam, olay_turu, aciklama, geom,
                    created_by_name, created_by_role_name, created_by_id,
                    active, photo_urls, video_urls, created_at
                ) VALUES (
                    %s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s,%s),4326),
                    %s, %s, %s, true, '[]'::text, '[]'::text, %s
                )
            """, (lat, lng, t[0], desc, lng, lat, user[1], user[2], user[0], date))
            
            inserted += 1
            if (i + 1) % 10 == 0 or (i + 1) == count:
                print(f"  📍 {i + 1}/{count} eklendi...")
        
        conn.commit()
        print(f"\n {inserted} olay başarıyla eklendi!")
        
    except ValueError:
        print("Geçersiz değer!")
    except Exception as e:
        conn.rollback()
        print(f"Hata: {e}")
    finally:
        conn.close()
        print("\nBağlantı kapatıldı")

if __name__ == "__main__":
    main()